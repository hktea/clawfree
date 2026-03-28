/**
 * Configuration helpers for the ClawFree channel.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import axios from "axios";
import { DEFAULT_CONFIG } from "./constants.js";

const CHANNEL_ID = "clawfree";

export interface PluginConfig {
  apiKey?: string;
  serverUrl?: string;
  pollIntervalMs?: number;
  sessionKey?: string;
  debug?: boolean;
  mode?: "public" | "local";
  token?: string;
}

type AccountConfig = PluginConfig & {
  enabled?: boolean;
};

type ChannelEntry = PluginConfig & {
  enabled?: boolean;
  defaults?: Partial<AccountConfig>;
  accounts?: Record<string, AccountConfig>;
};

export interface AutoConfigResult {
  success: boolean;
  serverUrl?: string;
  apiKey?: string;
  error?: string;
}

export interface ResolvedAccountConfig extends PluginConfig {
  enabled: boolean;
}

function getChannelEntry(cfg?: OpenClawConfig): ChannelEntry | undefined {
  return cfg?.channels?.[CHANNEL_ID] as ChannelEntry | undefined;
}

function sanitizeSessionSegment(value: string): string {
  return String(value).trim().replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function buildAutoSessionKey(accountId: string, config: Partial<PluginConfig>): string {
  const accountSegment = sanitizeSessionSegment(accountId || "default");
  const keySuffix = config.apiKey ? sanitizeSessionSegment(config.apiKey.slice(-8)) : "";

  if (keySuffix && accountSegment !== "default") {
    return `agent:clawfree:${accountSegment}:${keySuffix}`;
  }

  if (keySuffix) {
    return `agent:clawfree:${keySuffix}`;
  }

  return `agent:clawfree:${accountSegment}`;
}

function finalizePluginConfig(rawConfig: PluginConfig, accountId: string, multiAccount: boolean): PluginConfig {
  const normalizedConfig: PluginConfig = {
    ...rawConfig,
  };

  if (normalizedConfig.sessionKey?.trim()) {
    normalizedConfig.sessionKey = normalizedConfig.sessionKey.trim();
    return normalizedConfig;
  }

  normalizedConfig.sessionKey = multiAccount
    ? buildAutoSessionKey(accountId, normalizedConfig)
    : DEFAULT_CONFIG.sessionKey;

  return normalizedConfig;
}

function finalizeResolvedConfig(
  rawConfig: AccountConfig,
  accountId: string,
  multiAccount: boolean,
  fallbackEnabled = true,
): ResolvedAccountConfig {
  const normalized = finalizePluginConfig(rawConfig, accountId, multiAccount);

  return {
    ...normalized,
    enabled: rawConfig.enabled ?? fallbackEnabled,
  };
}

function getBaseConfigForAccount(multiAccount: boolean): PluginConfig {
  if (!multiAccount) {
    return { ...DEFAULT_CONFIG };
  }

  const { sessionKey: _sessionKey, ...rest } = DEFAULT_CONFIG;
  return { ...rest };
}

export async function fetchConfigByToken(
  token: string,
  serverUrl: string = "https://wx.clawwx.top",
): Promise<AutoConfigResult> {
  try {
    const response = await axios.get(`${serverUrl}/api/clawfree/keys`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    if (response.data && response.data.success) {
      const keys = response.data.keys;
      if (!keys || keys.length === 0) {
        return { success: false, error: "No API key found, please create a session in the mini program first" };
      }

      const paidKey = keys.find((k: any) => k.keyType === "paid" && k.isActive);
      const firstKey = keys[0];
      const selectedKey = paidKey || firstKey;

      return {
        success: true,
        serverUrl: response.data.serverUrl || serverUrl,
        apiKey: selectedKey.keyValue,
      };
    }

    return { success: false, error: response.data?.error || "Failed to fetch config" };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export function getPluginConfig(cfg: unknown, accountId: string = "default"): PluginConfig {
  return resolveAccountConfig(cfg, accountId);
}

export function resolveAccountConfig(cfg: unknown, accountId: string = "default"): ResolvedAccountConfig {
  const channelConfig = getChannelEntry(cfg as OpenClawConfig);

  if (!channelConfig) {
    return {
      ...DEFAULT_CONFIG,
      enabled: true,
    };
  }

  const channelDefaults = (channelConfig.defaults || {}) as Partial<AccountConfig>;
  const channelAccounts = (channelConfig.accounts || {}) as Record<string, AccountConfig>;
  const hasChannelAccounts = Object.keys(channelAccounts).length > 0;

  if (channelAccounts[accountId]) {
    return finalizeResolvedConfig({
      ...getBaseConfigForAccount(hasChannelAccounts),
      ...channelDefaults,
      ...channelAccounts[accountId],
    }, accountId, hasChannelAccounts, channelConfig.enabled ?? true);
  }

  return finalizeResolvedConfig({
    ...DEFAULT_CONFIG,
    ...channelConfig,
  }, accountId, false, channelConfig.enabled ?? true);
}

export function isConfigValid(config: PluginConfig): boolean {
  return !!config.apiKey;
}

export function listAccountIds(cfg: unknown): string[] {
  const channelEntry = getChannelEntry(cfg as OpenClawConfig);
  const channelAccounts = channelEntry?.accounts as Record<string, unknown> | undefined;

  if (channelAccounts && Object.keys(channelAccounts).length > 0) {
    return Object.keys(channelAccounts);
  }

  return ["default"];
}

export function validatePluginConfig(cfg: unknown): { ok: boolean; errors: string[] } {
  const channelEntry = getChannelEntry(cfg as OpenClawConfig);
  const errors: string[] = [];

  if (!channelEntry) {
    errors.push("Channel config not found at channels.clawfree");
    return { ok: false, errors };
  }

  const channelAccounts = channelEntry.accounts as Record<string, { apiKey?: string; serverUrl?: string; token?: string }> | undefined;
  const hasChannelApiKey = channelEntry.apiKey
    || (channelAccounts && Object.keys(channelAccounts).some(k => channelAccounts[k]?.apiKey));
  const hasChannelToken = channelEntry.token
    || (channelAccounts && Object.keys(channelAccounts).some(k => channelAccounts[k]?.token));

  if (!hasChannelApiKey && !hasChannelToken) {
    errors.push("API Key or Token is required");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
