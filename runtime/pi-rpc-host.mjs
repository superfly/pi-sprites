import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || "43120");
const secret = process.env.PI_SPRITES_RPC_SECRET;
const piCommand = process.env.PI_COMMAND || "pi";
const piArgs = process.env.PI_ARGS
  ? JSON.parse(process.env.PI_ARGS)
  : ["--mode", "rpc", "--session-dir", process.env.PI_SESSION_DIR || "/home/sprite/.pi/sessions"];

const child = spawn(piCommand, piArgs, { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
const eventClients = new Set();
let stdoutBuffer = "";

function authorized(request) {
  if (!secret) return true;
  return request.headers.authorization === `Bearer ${secret}`;
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function broadcast(value) {
  const data = `data: ${JSON.stringify(value)}\n\n`;
  for (const response of eventClients) response.write(data);
}

function processLine(line) {
  if (!line) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    broadcast({ type: "host_error", message: "Pi emitted invalid JSONL" });
    return;
  }
  const waiter = message.type === "response" && message.id ? pending.get(message.id) : undefined;
  if (waiter) {
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  } else {
    broadcast(message);
  }
}

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  while (true) {
    const newline = stdoutBuffer.indexOf("\n");
    if (newline < 0) break;
    const line = stdoutBuffer.slice(0, newline).replace(/\r$/, "");
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    processLine(line);
  }
});

child.on("exit", (code, signal) => {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(`Pi exited (${code ?? signal ?? "unknown"})`));
  }
  pending.clear();
  process.exit(code || 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

function requestPi(command) {
  const id = typeof command.id === "string" && command.id ? command.id : `http-${randomUUID()}`;
  const request = { ...command, id };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for Pi RPC response"));
    }, 30_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

const server = createServer(async (request, response) => {
  if (!authorized(request)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, piPid: child.pid });
    return;
  }
  if (request.method === "GET" && request.url === "/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(": connected\n\n");
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return;
  }
  if (request.method === "POST" && request.url === "/rpc") {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1_048_576) {
        sendJson(response, 413, { error: "request too large" });
        return;
      }
      chunks.push(chunk);
    }
    try {
      const command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      sendJson(response, 200, await requestPi(command));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  sendJson(response, 404, { error: "not found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Pi RPC host listening on ${port}`);
});

function shutdown() {
  server.close();
  child.kill("SIGTERM");
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
