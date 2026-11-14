/**
 * Steps of a request made without a connection (answers, symptoms) wait here, in order,
 * and are sent when the connection returns. Cleared at logout, so nothing stays on the device.
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
  const storage = store();
  if (!storage) return;
  if (steps.length) storage.setItem(PREFIX + caseId, JSON.stringify(steps));
  else storage.removeItem(PREFIX + caseId);
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
export async function flushOutbox(
  caseId: string,
  send: (s: Step) => Promise<void>,
  isOffline: (e: unknown) => boolean,
) {
  for (;;) {
    const [next, ...rest] = readOutbox(caseId);
    if (!next) return "sent" as const;
    try {
      await send(next);
      write(caseId, rest);
    } catch (error) {
      if (isOffline(error)) return "offline" as const;
      write(caseId, []);
      return "rejected" as const;
    }
  }
}

/** At logout: every waiting step, for every case. */
export function clearOutboxes() {
  const storage = store();
  if (!storage) return;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (k): k is string => !!k?.startsWith(PREFIX),
  );
  keys.forEach((key) => storage.removeItem(key));
}
