import type {
  NetworkPolicy,
  PrivilegesPolicy,
  ResourcesPolicy,
  ServiceRequest,
} from "@fly/sprites";

export type RuntimeMode = "auto" | "local" | "remote";
export type CheckpointMode = "off" | "risky" | "turn";
export type CleanupMode = "never" | "on-success" | "always";

export interface CheckpointConfig {
  mode?: CheckpointMode;
  retention?: number;
}

export interface BootstrapConfig {
  repository?: string;
  branch?: string;
  commands?: string[];
  services?: Array<ServiceRequest & { name: string; duration?: string }>;
  checkpoint?: boolean;
}

export interface PolicyConfig {
  network?: NetworkPolicy;
  privileges?: PrivilegesPolicy;
  resources?: ResourcesPolicy;
}

export interface CiConfig {
  command?: string;
  namePrefix?: string;
  cleanup?: CleanupMode;
}

export interface WorkersConfig {
  count?: number;
  namePrefix?: string;
  agentCommand?: string;
  cleanup?: CleanupMode;
}

export interface RpcHostConfig {
  port?: number;
  httpPort?: number;
  localPort?: number;
  piCommand?: string;
  secretEnv?: string;
}

export interface PiSpritesConfig {
  mode?: RuntimeMode;
  sprite?: string;
  remoteCwd?: string;
  baseURL?: string;
  tokenEnv?: string;
  checkpoint?: CheckpointConfig;
  bootstrap?: BootstrapConfig;
  policy?: PolicyConfig;
  ci?: CiConfig;
  workers?: WorkersConfig;
  rpcHost?: RpcHostConfig;
}

export interface RuntimeOverrides {
  mode?: RuntimeMode;
  sprite?: string;
  remoteCwd?: string;
}

export interface WorkerResult {
  sprite: string;
  task: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}
