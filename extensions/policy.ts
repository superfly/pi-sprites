import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { NetworkPolicy, PolicyRule } from "@fly/sprites";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { errorMessage, textResult } from "../src/output.js";
import { applyPolicies } from "../src/policy.js";
import { runtime } from "../src/runtime.js";

function formatPolicy(policy: NetworkPolicy): string {
  if (policy.rules.length === 0) return "Network policy: unrestricted (no enforcement rules).";
  return policy.rules.map((rule) => rule.include ? `include ${rule.include}` : `${rule.action || "allow"} ${rule.domain}`).join("\n");
}

async function addRule(rule: PolicyRule): Promise<NetworkPolicy> {
  const sprite = runtime.sprite();
  const current = await sprite.getNetworkPolicy();
  const duplicate = current.rules.some((item) => item.domain === rule.domain && item.action === rule.action && item.include === rule.include);
  const next = duplicate ? current : { rules: [...current.rules, rule] };
  await sprite.updateNetworkPolicy(next);
  return next;
}

async function policyAction(action: string, args: string[], ctx: ExtensionContext): Promise<string> {
  const sprite = runtime.sprite();
  switch (action) {
    case "show": {
      const [network, privileges, resources] = await Promise.all([
        sprite.getNetworkPolicy(), sprite.getPrivilegesPolicy(), sprite.getResourcesPolicy(),
      ]);
      return `${formatPolicy(network)}\n\nPrivileges:\n${JSON.stringify(privileges, null, 2)}\n\nResources:\n${JSON.stringify(resources, null, 2)}`;
    }
    case "allow":
    case "deny": {
      if (!args[0]) throw new Error(`Usage: /sprite-policy ${action} <domain>`);
      return formatPolicy(await addRule({ domain: args[0], action }));
    }
    case "defaults": return formatPolicy(await addRule({ include: "defaults" }));
    case "apply": {
      const applied = await applyPolicies(sprite, runtime.config.policy);
      return applied.length ? `Applied configured ${applied.join(", ")} policies.` : "No policies are configured in .pi/sprites.json.";
    }
    case "unrestricted": {
      const confirmed = await ctx.ui.confirm("Remove network restrictions?", "This will allow the Sprite to reach any public domain.");
      if (!confirmed) return "Cancelled.";
      await sprite.updateNetworkPolicy({ rules: [] });
      return "Network policy is now unrestricted.";
    }
    default: throw new Error("Usage: /sprite-policy [show|allow|deny|defaults|apply|unrestricted] ...");
  }
}

export default function policyExtension(pi: ExtensionAPI): void {
  pi.registerCommand("sprite-policy", {
    description: "Inspect or update Sprite network, privilege, and resource policies",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        const [action = "show", ...args] = splitArgs(input);
        ctx.ui.notify(await policyAction(action, args, ctx), "info");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerTool({
    name: "sprite_policy",
    label: "Sprite policy",
    description: "Inspect Sprite policies, add an outbound allow/deny rule, include development defaults, or apply project policy configuration.",
    promptSnippet: "Inspect and tighten Sprite network and resource policies",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("get"), Type.Literal("allow"), Type.Literal("deny"),
        Type.Literal("defaults"), Type.Literal("apply_config"),
      ]),
      domain: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd);
      const sprite = runtime.sprite();
      if (params.action === "get") {
        const [network, privileges, resources] = await Promise.all([
          sprite.getNetworkPolicy(), sprite.getPrivilegesPolicy(), sprite.getResourcesPolicy(),
        ]);
        return textResult(JSON.stringify({ network, privileges, resources }, null, 2));
      }
      if (params.action === "apply_config") {
        const applied = await applyPolicies(sprite, runtime.config.policy);
        return textResult(applied.length ? `Applied ${applied.join(", ")}` : "No configured policies.");
      }
      if (params.action === "defaults") return textResult(formatPolicy(await addRule({ include: "defaults" })));
      if (!params.domain) throw new Error("domain is required");
      return textResult(formatPolicy(await addRule({ domain: params.domain, action: params.action })));
    },
  });
}
