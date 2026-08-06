import { existsSync } from "node:fs";
import { Sprite, SpritesClient, type ProxySession } from "@fly/sprites";
import { defaultRemoteCwd, loadConfig } from "./config.js";
import type { PiSpritesConfig, RuntimeOverrides } from "./types.js";

export class PiSpritesRuntime {
  private client: SpritesClient | undefined;
  private proxies = new Set<ProxySession>();
  private configuredCwd: string | undefined;
  private overrides: RuntimeOverrides = {};

  config: PiSpritesConfig = {};
  localCwd = process.cwd();
  selectedName: string | undefined;
  remoteCwd = defaultRemoteCwd(process.cwd());
  lastCheckpoint: string | undefined;

  readonly insideSprite = existsSync("/.sprite/api.sock");

  configure(cwd: string, overrides: RuntimeOverrides = {}): void {
    this.localCwd = cwd;
    this.configuredCwd = cwd;
    this.overrides = { ...this.overrides, ...overrides };
    this.config = loadConfig(cwd, this.overrides);
    this.selectedName = this.config.sprite || this.selectedName;
    this.remoteCwd = this.config.remoteCwd || defaultRemoteCwd(cwd);
    this.client = undefined;
  }

  ensureConfigured(cwd: string): void {
    if (this.configuredCwd !== cwd) this.configure(cwd, this.overrides);
  }

  remoteEnabled(): boolean {
    if (this.config.mode === "local") return false;
    if (this.config.mode === "remote") return Boolean(this.selectedName);
    return Boolean(this.selectedName) && !this.insideSprite;
  }

  getClient(): SpritesClient {
    if (this.client) return this.client;
    const configuredEnv = this.config.tokenEnv || "SPRITES_TOKEN";
    const token = process.env[configuredEnv] || process.env.SPRITES_TOKEN || process.env.SPRITE_TOKEN;
    if (!token) {
      throw new Error(
        `No Sprites token found. Set ${configuredEnv} (SPRITES_TOKEN and SPRITE_TOKEN are also supported).`,
      );
    }
    this.client = new SpritesClient(token, this.config.baseURL ? { baseURL: this.config.baseURL } : undefined);
    return this.client;
  }

  sprite(name = this.selectedName): Sprite {
    if (!name) throw new Error("No Sprite selected. Use /sprite-use <name> or --sprite <name>.");
    return this.getClient().sprite(name);
  }

  select(name: string, remoteCwd?: string): void {
    this.selectedName = name;
    this.config.mode = "remote";
    if (remoteCwd) this.remoteCwd = remoteCwd;
  }

  useLocal(): void {
    this.config.mode = "local";
  }

  async create(name: string): Promise<Sprite> {
    const sprite = await this.getClient().createSprite(name, { runtime: "dev", waitForCapacity: true });
    this.select(name);
    return sprite;
  }

  registerProxy(proxy: ProxySession): void {
    this.proxies.add(proxy);
  }

  async close(): Promise<void> {
    for (const proxy of this.proxies) proxy.close();
    this.proxies.clear();
    if (this.selectedName && this.client) this.client.sprite(this.selectedName).closeControlConnection();
  }

  status(): string {
    if (this.insideSprite && !this.remoteEnabled()) return "inside Sprite · local tools";
    if (!this.remoteEnabled()) return "local tools";
    return `${this.selectedName}:${this.remoteCwd}`;
  }
}

export const runtime = new PiSpritesRuntime();
