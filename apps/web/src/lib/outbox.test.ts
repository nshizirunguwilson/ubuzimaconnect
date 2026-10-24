import { beforeEach, describe, expect, it } from "vitest";
import { clearOutboxes, flushOutbox, queueStep, readOutbox } from "./outbox";

// A stand-in for the browser's localStorage.
const data = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
  key: (i: number) => [...data.keys()][i] ?? null,
  get length() {
    return data.size;
  },
  clear: () => data.clear(),
} as Storage;

const offline = new Error("offline");
const isOffline = (e: unknown) => e === offline;

describe("the offline outbox (FR 3.10)", () => {
  beforeEach(() => data.clear());

  it("sends waiting steps in the order they were made", async () => {
    queueStep("c1", { path: "/answers", body: { q: 1 } });
    queueStep("c1", { path: "/answers", body: { q: 2 } });
    queueStep("c1", { path: "/symptoms", body: { d: "cough" } });
    const sent: string[] = [];
    expect(await flushOutbox("c1", async (s) => void sent.push(`${s.path}:${JSON.stringify(s.body)}`), isOffline)).toBe("sent");
    expect(sent).toEqual(['/answers:{"q":1}', '/answers:{"q":2}', '/symptoms:{"d":"cough"}']);
    expect(readOutbox("c1")).toEqual([]);
  });

  it("keeps what wasn't sent when the connection drops again", async () => {
    queueStep("c1", { path: "/answers", body: 1 });
    queueStep("c1", { path: "/answers", body: 2 });
    let calls = 0;
    const result = await flushOutbox(
      "c1",
      async () => {
        if (++calls === 2) throw offline;
      },
      isOffline,
    );
    expect(result).toBe("offline");
    expect(readOutbox("c1")).toEqual([{ path: "/answers", body: 2 }]);
  });

  it("drops the rest when the server refuses a step, and clears everything at logout", async () => {
    queueStep("c1", { path: "/answers", body: 1 });
    queueStep("c1", { path: "/answers", body: 2 });
    queueStep("c2", { path: "/symptoms", body: 3 });
    expect(await flushOutbox("c1", async () => Promise.reject(new Error("409")), isOffline)).toBe("rejected");
    expect(readOutbox("c1")).toEqual([]);
    data.set("uc_nearby", "kept: facilities only, nothing about the patient");
    clearOutboxes();
    expect(readOutbox("c2")).toEqual([]);
    expect(data.has("uc_nearby")).toBe(true);
  });
});
