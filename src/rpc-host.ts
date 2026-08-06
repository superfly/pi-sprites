import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Sprite } from "@fly/sprites";
import { collectEvents } from "./output.js";
import { runtime } from "./runtime.js";

const REMOTE_SCRIPT = "/home/sprite/.local/share/pi-sprites/pi-rpc-host.mjs";
const SERVICE_NAME = "pi-rpc-host";

export async function installRpcHost(sprite: Sprite): Promise<string[]> {
  const config = runtime.config.rpcHost || {};
  const port = config.port || 43120;
  const httpPort = config.httpPort;
  const secretEnv = config.secretEnv || "PI_SPRITES_RPC_SECRET";
  const secret = process.env[secretEnv];
  if (httpPort && !secret) {
    throw new Error(`${secretEnv} must be set before exposing the RPC host through the Sprite URL.`);
  }

  const piCommand = config.piCommand || "pi";
  try {
    await sprite.execFile("which", [piCommand]);
  } catch {
    await sprite.exec("npm install -g @earendil-works/pi-coding-agent", { maxBuffer: 16 * 1024 * 1024 });
  }

  const script = await readFile(fileURLToPath(new URL("../runtime/pi-rpc-host.mjs", import.meta.url)), "utf8");
  const fs = sprite.filesystem("/");
  await fs.mkdir("/home/sprite/.local/share/pi-sprites", { recursive: true });
  await fs.writeFile(REMOTE_SCRIPT, script, { mode: 0o755 });

  const existing = await sprite.listServices();
  if (existing.some((service) => service.name === SERVICE_NAME)) {
    await sprite.deleteService(SERVICE_NAME);
  }

  const stream = await sprite.createService(SERVICE_NAME, {
    cmd: "node",
    args: [REMOTE_SCRIPT],
    dir: runtime.remoteCwd,
    env: {
      PORT: String(port),
      PI_COMMAND: piCommand,
      ...(secret && { PI_SPRITES_RPC_SECRET: secret }),
    },
    ...(httpPort !== undefined && { httpPort }),
  }, "10s");
  return collectEvents(stream);
}

export async function proxyRpcHost(sprite: Sprite, localPort?: number): Promise<string> {
  const remotePort = runtime.config.rpcHost?.port || 43120;
  const selectedLocalPort = localPort ?? runtime.config.rpcHost?.localPort ?? remotePort;
  const proxy = await sprite.proxyPort(selectedLocalPort, remotePort);
  runtime.registerProxy(proxy);
  return proxy.localAddr() || `localhost:${selectedLocalPort}`;
}

export async function removeRpcHost(sprite: Sprite): Promise<void> {
  await sprite.deleteService(SERVICE_NAME);
}

export async function rpcHostStatus(sprite: Sprite): Promise<string> {
  const service = await sprite.getService(SERVICE_NAME);
  return `${service.name} · ${service.state?.status || "unknown"} · port ${runtime.config.rpcHost?.port || 43120}`;
}
