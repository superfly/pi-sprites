import type { Checkpoint, Sprite } from "@fly/sprites";

/** List checkpoints without applying the SDK's specific-history-version filter. */
export function listUnfilteredCheckpoints(sprite: Sprite): Promise<Checkpoint[]> {
  return sprite.listCheckpoints();
}
