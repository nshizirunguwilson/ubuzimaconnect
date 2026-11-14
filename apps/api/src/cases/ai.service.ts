import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Injectable, Logger } from "@nestjs/common";
import { CATEGORIES, type AiOutcome, type Category, type Confidence, type Urgency } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";

/** The AI must answer within 10 seconds. */
const TIMEOUT_MS = 10_000;
/** After 3 failures in a row... */
const BREAKER_FAILURES = 3;
/** ...the AI isn't called for 1 minute (a "circuit breaker"), so patients don't wait on a service that is down. */
const BREAKER_OPEN_MS = 60_000;

/** Everything sent to the AI. Never the name, national ID or location. */
export type AiInput = {
  description: string;
  duration: string;
  severity: number;
  ageYears: number;
  ageMonths: number;
  sex: "FEMALE" | "MALE";
  pregnant: boolean | null;
  redFlagsAsked: number;
};

const SYSTEM = `You help a telehealth service in Rwanda sort patient messages. A licensed human agent reviews every case and makes every decision; you only make a first-pass suggestion.

All the patient's danger-sign (red-flag) answers were "No". Read the description and suggest:
- category: exactly one of ${CATEGORIES.join(", ")}.
- urgency: "URGENT" if the person may need care at a facility within hours, otherwise "MINOR". Use the World Health Organization priority signs: tiny baby, high fever in a child, severe pain, severe pallor, trauma or injury, poisoning, restlessness or lethargy, referral, malnutrition, burns, breathing difficulty, pregnancy problems. Any of these means URGENT.
- confidence: "LOW", "MEDIUM" or "HIGH": how sure you are of the urgency. Use LOW when the description is vague, contradictory or outside what you can judge.
- reason: one short sentence in plain English for the agent. No diagnosis, no medicine names.

If you are unsure, say URGENT or use LOW confidence. Never reassure.`;

const SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    urgency: { type: "string", enum: ["URGENT", "MINOR"] },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    reason: { type: "string" },
  },
  required: ["category", "urgency", "confidence", "reason"],
};

/**
 * Asks Gemini for a first suggestion of category and urgency, with a 10-second limit and a circuit breaker.
 * Any failure becomes a result the triage rules treat as Uncertain, and the patient sees the normal message,
 * not an error. A human agent reviews every case either way.
 */
@Injectable()
export class AiService {
  private log = new Logger("AI");
  private client = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        // Only set in tests, to point at a local stand-in for Gemini.
        httpOptions: process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : undefined,
      })
    : null;
  /** A Lite model with minimal thinking answers in about 1 second, well inside the 10-second limit. */
  private model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  private thinking = (process.env.GEMINI_THINKING || "MINIMAL") as ThinkingLevel;
  private failuresInARow = 0;
  private openUntil = 0;

  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  async suggest(caseId: string, input: AiInput): Promise<AiOutcome & { latencyMs?: number }> {
    const settings = await this.db.client.systemSettings.findUnique({ where: { id: 1 } });
    if (settings && !settings.aiEnabled) return { ok: false, error: "OFF" };
    if (!this.client) return { ok: false, error: "NOT_CONFIGURED" };
    if (Date.now() < this.openUntil) return { ok: false, error: "BREAKER_OPEN" };

    const started = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: SCHEMA,
          thinkingConfig: { thinkingLevel: this.thinking },
          abortSignal: abort.signal,
        },
      });
      const answer = JSON.parse(res.text ?? "{}") as {
        category?: string;
        urgency?: string;
        confidence?: string;
        reason?: string;
      };
      this.failuresInARow = 0;

      // The answer is checked value by value: anything outside the allowed lists becomes null.
      return {
        ok: true,
        category: oneOf(CATEGORIES, answer.category) as Category | null,
        urgency: oneOf(["URGENT", "MINOR"], answer.urgency) as Urgency | null,
        confidence: oneOf(["LOW", "MEDIUM", "HIGH"], answer.confidence) as Confidence | null,
        reason: answer.reason?.slice(0, 400) ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const timedOut = abort.signal.aborted;
      await this.failed(caseId, timedOut ? "TIMEOUT" : (error as Error).message);
      return { ok: false, error: timedOut ? "TIMEOUT" : "ERROR", latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  private async failed(caseId: string, detail: string) {
    this.failuresInARow++;
    if (this.failuresInARow >= BREAKER_FAILURES) {
      this.openUntil = Date.now() + BREAKER_OPEN_MS;
      this.failuresInARow = 0;
      this.log.warn("Circuit breaker open for 1 minute");
    }
    this.log.warn(`AI failure: ${detail}`);
    // Every failure is logged. TimersService alerts the administrator when there are more than 5 in 5 minutes.
    await this.db.client.systemSettings
      .update({ where: { id: 1 }, data: { aiFailureCount: { increment: 1 } } })
      .catch(() => null);
    await this.audit.record({ type: "system" }, "ai.failure", { caseId, detail: detail.slice(0, 200) });
  }
}

/** The value when it is one of the allowed ones, otherwise null. */
function oneOf(allowed: readonly string[], value: string | undefined): string | null {
  return value !== undefined && allowed.includes(value) ? value : null;
}
