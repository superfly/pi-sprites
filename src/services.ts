import type { ServiceRequest, ServiceWithState, Sprite } from "@fly/sprites";
import { collectEvents } from "./output.js";

export function formatService(service: ServiceWithState): string {
  const status = service.state?.status || "unknown";
  const port = service.httpPort ? ` · http:${service.httpPort}` : "";
  const restarts = service.state?.restartCount ? ` · restarts:${service.state.restartCount}` : "";
  return `${service.name} · ${status}${port}${restarts} · ${service.cmd} ${service.args.join(" ")}`.trim();
}

export async function ensureService(
  sprite: Sprite,
  name: string,
  config: ServiceRequest,
  duration = "5s",
): Promise<string[]> {
  const existing = await sprite.listServices();
  if (existing.some((service) => service.name === name)) return [`${name}: already configured`];
  return collectEvents(await sprite.createService(name, config, duration));
}

export async function reconcileServices(
  sprite: Sprite,
  services: Array<ServiceRequest & { name: string; duration?: string }>,
): Promise<string[]> {
  const results: string[] = [];
  for (const service of services) {
    const { name, duration, ...config } = service;
    results.push(...await ensureService(sprite, name, config, duration));
  }
  return results;
}
