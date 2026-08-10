import nodePath from "node:path";
import type {
  BashOperations,
  EditOperations,
  FindOperations,
  LsOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { ExecError, type Sprite } from "@fly/sprites";
import { runtime } from "./runtime.js";

function toRemoteCwd(cwd: string): string {
  const relative = nodePath.relative(runtime.localCwd, cwd);
  if (!relative || relative === ".") return runtime.remoteCwd;
  if (relative.startsWith("..") || nodePath.isAbsolute(relative)) return runtime.remoteCwd;
  return nodePath.posix.join(runtime.remoteCwd, relative.split(nodePath.sep).join("/"));
}

function imageMime(path: string): string | null {
  switch (nodePath.extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: return null;
  }
}

export function createRemoteReadOps(sprite: Sprite): ReadOperations {
  const fs = sprite.filesystem("/");
  return {
    readFile: (path) => fs.readFile(path, null),
    access: async (path) => { await fs.stat(path); },
    detectImageMimeType: async (path) => imageMime(path),
  };
}

export function createRemoteWriteOps(sprite: Sprite): WriteOperations {
  const fs = sprite.filesystem("/");
  return {
    writeFile: (path, content) => fs.writeFile(path, content),
    mkdir: (path) => fs.mkdir(path, { recursive: true }),
  };
}

export function createRemoteEditOps(sprite: Sprite): EditOperations {
  const read = createRemoteReadOps(sprite);
  const write = createRemoteWriteOps(sprite);
  return { readFile: read.readFile, access: read.access, writeFile: write.writeFile };
}

export function createRemoteLsOps(sprite: Sprite): LsOperations {
  const fs = sprite.filesystem("/");
  return {
    exists: (path) => fs.exists(path),
    stat: (path) => fs.stat(path),
    readdir: (path) => fs.readdir(path),
  };
}

export function createRemoteFindOps(sprite: Sprite): FindOperations {
  const fs = sprite.filesystem("/");
  return {
    exists: (path) => fs.exists(path),
    glob: async (pattern, cwd, { limit }) => {
      const result = await sprite.execFile("find", [
        cwd,
        "-type", "d", "(", "-name", ".git", "-o", "-name", "node_modules", ")", "-prune",
        "-o", "-type", "f", "-print",
      ], { maxBuffer: 8 * 1024 * 1024 });
      const normalizedPattern = pattern.replaceAll("\\", "/");
      const files = String(result.stdout).split("\n").filter(Boolean);
      return files.filter((file) => {
        const relative = nodePath.posix.relative(cwd, file);
        return nodePath.matchesGlob(relative, normalizedPattern) || nodePath.matchesGlob(nodePath.posix.basename(file), normalizedPattern);
      }).slice(0, limit);
    },
  };
}

export function createRemoteBashOps(sprite: Sprite): BashOperations {
  return {
    exec: (command, cwd, { onData, signal, timeout }) => new Promise((resolve, reject) => {
      const child = sprite.spawn("/bin/bash", ["-lc", command], {
        cwd: toRemoteCwd(cwd),
      });
      let timedOut = false;
      const timer = timeout && timeout > 0 ? setTimeout(() => {
        timedOut = true;
        child.kill("KILL");
      }, timeout * 1000) : undefined;
      const abort = () => child.kill("TERM");
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", reject);
      child.wait().then((exitCode) => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) reject(new Error("aborted"));
        else if (timedOut) reject(new Error(`timeout:${timeout}`));
        else resolve({ exitCode });
      }, reject);
    }),
  };
}

export async function remoteGrep(
  sprite: Sprite,
  input: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number },
  signal?: AbortSignal,
): Promise<string> {
  const path = input.path ? nodePath.posix.resolve(runtime.remoteCwd, input.path) : runtime.remoteCwd;
  const args = ["--line-number", "--color=never", "--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**"];
  if (input.ignoreCase) args.push("--ignore-case");
  if (input.literal) args.push("--fixed-strings");
  if (input.glob) args.push("--glob", input.glob);
  if (input.context && input.context > 0) args.push("--context", String(input.context));
  args.push("--", input.pattern, path);
  const result = await sprite.execFile("rg", args, { maxBuffer: 4 * 1024 * 1024, ...(signal && { signal }) }).catch((error: unknown) => {
    if (error instanceof ExecError && error.exitCode === 1) return error.result;
    throw error;
  });
  const lines = String(result.stdout).split("\n");
  const limit = Math.max(1, input.limit ?? 100);
  const output = lines.slice(0, limit).join("\n").trim();
  return output || "No matches found";
}

export function mapRemoteCwd(cwd: string): string {
  return toRemoteCwd(cwd);
}
