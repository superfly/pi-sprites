import { existsSync } from "node:fs";
import { Sprite, SpritesClient, type ProxySession } from "@fly/sprites";
import { defaultRemoteCwd, loadConfig } from "./config.js";
import type { PiSpritesConfig, RuntimeOverrides } from "./types.js";

export class PiSpritesRuntime {
  private client: SpritesClient | undefined;
  private proxies = new Set<ProxySession>();
  private configuredCwd: string | undefined;
  private configuredTrust: boolean | undefined;
  private overrides: RuntimeOverrides = {};
  private sessionId: string | undefined;
  private spriteToolBaseline: Set<string> | undefined;

  config: PiSpritesConfig = {};
  coreAvailable = false;
  projectTrusted = false;
  localCwd = process.cwd();
  selectedName: string | undefined;
  remoteCwd = defaultRemoteCwd(process.cwd());
  lastCheckpoint: string | undefined;

  readonly insideSprite = existsSync("/.sprite/api.sock");

  private configure(cwd: string, projectTrusted: boolean, preserveSelection: boolean): void {
    const selectedName = this.selectedName;
    const remoteCwd = this.remoteCwd;
    this.localCwd = cwd;
    this.configuredCwd = cwd;
    this.configuredTrust = projectTrusted;
    this.projectTrusted = projectTrusted;
    this.config = loadConfig(cwd, this.overrides, projectTrusted);
    this.selectedName = this.config.sprite || (preserveSelection ? selectedName : undefined);
    this.remoteCwd = this.config.remoteCwd || (preserveSelection ? remoteCwd : defaultRemoteCwd(cwd));
    this.client = undefined;
  }

  beginSession(sessionId: string, cwd: string, projectTrusted: boolean, overrides: RuntimeOverrides = {}): void {
    const isNewSession = this.sessionId !== sessionId;
    if (isNewSession) {
      this.releaseResources();
      this.selectedName = undefined;
      this.lastCheckpoint = undefined;
      this.overrides = {};
      this.spriteToolBaseline = undefined;
      this.coreAvailable = false;
      this.sessionId = sessionId;
    }
    this.overrides = { ...this.overrides, ...overrides };
    if (isNewSession || this.configuredCwd !== cwd || this.configuredTrust !== projectTrusted || Object.keys(overrides).length > 0) {
      this.configure(cwd, projectTrusted, !isNewSession);
    }
  }

  ensureConfigured(cwd: string, projectTrusted: boolean): void {
    if (!this.sessionId) this.beginSession(`implicit:${cwd}`, cwd, projectTrusted);
    else if (this.configuredCwd !== cwd || this.configuredTrust !== projectTrusted) this.configure(cwd, projectTrusted, true);
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
    if (!name) throw this.selectionError();
    return this.getClient().sprite(name);
  }

  selectionError(): Error {
    const guidance = this.coreAvailable
      ? "Use /sprite-use <name> or --sprite <name>."
      : "Enable core.ts for /sprite-use, or configure sprite in a trusted .pi/sprites.json.";
    return new Error(`No Sprite selected. ${guidance}`);
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

  markCoreAvailable(): void {
    this.coreAvailable = true;
  }

  private releaseResources(): void {
    for (const proxy of this.proxies) proxy.close();
    this.proxies.clear();
    if (this.selectedName && this.client) this.client.sprite(this.selectedName).closeControlConnection();
  }

  async endSession(sessionId: string): Promise<void> {
    if (this.sessionId !== sessionId) return;
    this.releaseResources();
    this.sessionId = undefined;
    this.configuredCwd = undefined;
    this.configuredTrust = undefined;
    this.overrides = {};
    this.config = {};
    this.projectTrusted = false;
    this.coreAvailable = false;
    this.selectedName = undefined;
    this.remoteCwd = defaultRemoteCwd(process.cwd());
    this.lastCheckpoint = undefined;
    this.spriteToolBaseline = undefined;
    this.client = undefined;
  }

  captureSpriteToolBaseline(activeTools: string[], spriteToolNames: ReadonlySet<string>): void {
    if (!this.spriteToolBaseline) {
      this.spriteToolBaseline = new Set(activeTools.filter((name) => spriteToolNames.has(name)));
    }
  }

  desiredSpriteTools(): ReadonlySet<string> {
    const enabled = this.config.toolActivation === "always"
      || (this.config.toolActivation !== "off" && (this.remoteEnabled() || this.insideSprite));
    return enabled ? (this.spriteToolBaseline || new Set<string>()) : new Set<string>();
  }

  status(): string {
    if (this.insideSprite && !this.remoteEnabled()) return "inside Sprite · local tools";
    if (!this.remoteEnabled()) return "local tools";
    return `${this.selectedName}:${this.remoteCwd}`;
  }
}

// Pi intentionally evaluates each extension entry point with its module cache disabled.
// Keep one runtime on globalThis so separately loaded pi-sprites extensions share
// the selected Sprite, configuration, proxies, and checkpoint state.
const sharedGlobal = globalThis as typeof globalThis & {
  __piSpritesRuntimeV2?: PiSpritesRuntime;
};

export const runtime = sharedGlobal.__piSpritesRuntimeV2 ??= new PiSpritesRuntime();
