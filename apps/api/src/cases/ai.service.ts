import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Injectable, Logger } from "@nestjs/common";
import { CATEGORIES, type AiOutcome, type Category, type Confidence, type Urgency } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";

const TIMEOUT_MS = 10_000; // FR 4.3: a reply within 10 seconds
const BREAKER_FAILURES = 3; // FR 4.7: after 3 failures in a row...
const BREAKER_OPEN_MS = 60_000; // ...don't call the AI for 1 minute

/**
 * The only information sent to the AI (FR 4.6): never the name, national ID or location.
 */
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
 * FR 4.3 to 4.8: calls Gemini with a 10-second limit and a circuit breaker. Any failure becomes a
 * result the triage rules treat as Uncertain, and the patient sees the normal message, not an error.
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
  /** DECISIONS.md D33: a Lite model with minimal thinking answers in about 1 s, well inside FR 4.3's 10 s. */
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
      const data = JSON.parse(res.text ?? "{}") as { category?: string; urgency?: string; confidence?: string; reason?: string };
      this.failuresInARow = 0;
      return {
        ok: true,
        category: (CATEGORIES as readonly string[]).includes(data.category ?? "") ? (data.category as Category) : null,
        urgency: data.urgency === "URGENT" || data.urgency === "MINOR" ? (data.urgency as Urgency) : null,
        confidence: ["LOW", "MEDIUM", "HIGH"].includes(data.confidence ?? "") ? (data.confidence as Confidence) : null,
        reason: data.reason?.slice(0, 400) ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      const timedOut = abort.signal.aborted;
      await this.failed(caseId, timedOut ? "TIMEOUT" : (e as Error).message);
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
    // FR 10.1 logs AI failures; FR 4.7's administrator alert (more than 5 in 5 minutes) is built with alerts in phase 3.
    await this.db.client.systemSettings.update({ where: { id: 1 }, data: { aiFailureCount: { increment: 1 } } }).catch(() => null);
    await this.audit.record({ type: "system" }, "ai.failure", { caseId, detail: detail.slice(0, 200) });
  }
}
