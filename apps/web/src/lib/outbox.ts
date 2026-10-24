/**
 * FR 3.10: steps of a request made without a connection (answers, symptoms) wait here, in order,
 * and are sent when the connection returns. Cleared at logout, so nothing stays on the device (FR 1.8).
 */
export type Step = { path: string; body: unknown };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "uc_outbox:";
const store = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function readOutbox(caseId: string): Step[] {
  try {
    return JSON.parse(store()?.getItem(PREFIX + caseId) ?? "[]");
  } catch {
    return [];
  }
}

function write(caseId: string, steps: Step[]) {
  const s = store();
  if (!s) return;
  if (steps.length) s.setItem(PREFIX + caseId, JSON.stringify(steps));
  else s.removeItem(PREFIX + caseId);
}

export function queueStep(caseId: string, step: Step) {
  write(caseId, [...readOutbox(caseId), step]);
}

/**
 * Sends the waiting steps one by one, oldest first, removing each once the server has it.
 * "offline": the connection dropped again; the rest stay for next time.
 * "rejected": the server refused a step (the case moved on meanwhile); the rest are dropped,
 * because they were answers to questions the server no longer asks.
 */
export async function flushOutbox(caseId: string, send: (s: Step) => Promise<void>, isOffline: (e: unknown) => boolean) {
  for (;;) {
    const [next, ...rest] = readOutbox(caseId);
    if (!next) return "sent" as const;
    try {
      await send(next);
      write(caseId, rest);
    } catch (e) {
      if (isOffline(e)) return "offline" as const;
      write(caseId, []);
      return "rejected" as const;
    }
  }
}

/** At logout: every waiting step, for every case. */
export function clearOutboxes() {
  const s = store();
  if (!s) return;
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX));
  keys.forEach((k) => s.removeItem(k));
}
