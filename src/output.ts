import type { CheckpointStream, RestoreStream, ServiceLogStream } from "@fly/sprites";

type EventStream = CheckpointStream | RestoreStream | ServiceLogStream;

export async function collectEvents(stream: EventStream): Promise<string[]> {
  const lines: string[] = [];
  for await (const event of stream) {
    const record = event as unknown as Record<string, unknown>;
    const parts = [record.type, record.data, record.id, record.comment, record.exitCode, record.error]
      .filter((part) => part !== undefined && part !== null && part !== "")
      .map(String);
    if (parts.length > 0) lines.push(parts.join(": "));
  }
  return lines;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}
