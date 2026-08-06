import type { Sprite } from "@fly/sprites";
import type { PolicyConfig } from "./types.js";

export async function applyPolicies(sprite: Sprite, policy: PolicyConfig | undefined): Promise<string[]> {
  if (!policy) return [];
  const applied: string[] = [];
  if (policy.network) {
    await sprite.updateNetworkPolicy(policy.network);
    applied.push("network");
  }
  if (policy.privileges) {
    await sprite.updatePrivilegesPolicy(policy.privileges);
    applied.push("privileges");
  }
  if (policy.resources) {
    await sprite.updateResourcesPolicy(policy.resources);
    applied.push("resources");
  }
  return applied;
}
