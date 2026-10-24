import { createServer, type Server } from "node:http";

/**
 * A stand-in for the Gemini API. The reply depends on a word in the patient's description:
 * "urgentword" → urgent, "lowword" → low confidence, "brokenword" → HTTP 500; otherwise minor, high.
 */
export function startFakeGemini(port = 4299) {
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push(body);
      const text = body.toLowerCase();
      if (text.includes("brokenword")) {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 500, message: "boom" } }));
      }
      const answer = {
        category: "RESPIRATORY",
        urgency: text.includes("urgentword") ? "URGENT" : "MINOR",
        confidence: text.includes("lowword") ? "LOW" : "HIGH",
        reason: "Cough and mild fever without danger signs.",
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }));
    });
  });
  server.listen(port, "127.0.0.1");
  return { calls, close: () => new Promise<void>((r) => server.close(() => r())) };
}
