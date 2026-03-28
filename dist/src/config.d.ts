/**
 * Configuration helpers for the ClawFree channel.
 */
export interface PluginConfig {
    apiKey?: string;
    serverUrl?: string;
    pollIntervalMs?: number;
    sessionKey?: string;
    debug?: boolean;
    mode?: "public" | "local";
    token?: string;
}
export interface AutoConfigResult {
    success: boolean;
    serverUrl?: string;
    apiKey?: string;
    error?: string;
}
export interface ResolvedAccountConfig extends PluginConfig {
    enabled: boolean;
}
export declare function fetchConfigByToken(token: string, serverUrl?: string): Promise<AutoConfigResult>;
export declare function getPluginConfig(cfg: unknown, accountId?: string): PluginConfig;
export declare function resolveAccountConfig(cfg: unknown, accountId?: string): ResolvedAccountConfig;
export declare function isConfigValid(config: PluginConfig): boolean;
export declare function listAccountIds(cfg: unknown): string[];
export declare function validatePluginConfig(cfg: unknown): {
    ok: boolean;
    errors: string[];
};
