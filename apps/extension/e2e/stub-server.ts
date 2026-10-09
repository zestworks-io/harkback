import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const pdfDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/pdf");

export interface StubReply {
  status?: number;
  /** Full model output; defaults to an answer generated from the selected term. */
  body?: string;
  chunks?: number;
  delayMs?: number;
}

export interface StubRequestBody {
  model: string;
  stream: boolean;
  messages: { role: string; content: string }[];
}

export interface StubServer {
  url: string;
  requests: { body: StubRequestBody }[];
  queue: StubReply[];
  close(): Promise<void>;
}

function defaultOutput(user: string, domain = "ml"): string {
  const term = /<selected>([\s\S]*?)<\/selected>/.exec(user)?.[1]?.trim() || "term";
  const card = { match: null, canonical: term, aliases: [], domain, broader: [], variants: [], prerequisites: [], confidence: {} };
  return `<explanation>${term} 是一个测试解释。</explanation>\n<evidence>NONE</evidence>\n<card>${JSON.stringify(card)}</card>`;
}

/** A reply whose card says nothing about the field, so it never joins a concept by name and a close match is asked about instead. */
export const otherDomainReply = (term: string): StubReply => ({ body: defaultOutput(`<selected>${term}</selected>`, "other") });

export async function startStubServer(): Promise<StubServer> {
  const requests: { body: StubRequestBody }[] = [];
  const queue: StubReply[] = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
  const server = createServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    for await (const c of req) chunks.push(c as Uint8Array);
    const raw = new TextDecoder().decode(Buffer.concat(chunks));
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    const pdf = req.method === "GET" ? /^\/pdf\/([a-z-]+\.pdf)$/.exec(req.url ?? "")?.[1] : undefined;
    if (pdf) {
      const file = path.join(pdfDir, pdf);
      if (existsSync(file)) res.writeHead(200, { "content-type": "application/pdf" }).end(readFileSync(file));
      else res.writeHead(404).end("not found");
      return;
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "stub-model" }] }));
      return;
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const body = JSON.parse(raw) as StubRequestBody;
      requests.push({ body });
      const reply = queue.shift() ?? {};
      if (reply.status !== undefined && reply.status !== 200) {
        res.writeHead(reply.status, cors).end("error");
        return;
      }
      const output = reply.body ?? defaultOutput(body.messages.find((m) => m.role === "user")?.content ?? "");
      res.writeHead(200, { ...cors, "content-type": "text/event-stream" });
      const size = Math.max(1, Math.ceil(output.length / (reply.chunks ?? 3)));
      for (let i = 0; i < output.length; i += size) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: output.slice(i, i + size) } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, reply.delayMs ?? 20));
      }
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(404, cors).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    queue,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
