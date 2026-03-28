/**
 * Configuration helpers for the ClawFree channel.
 */
import axios from "axios";
import { DEFAULT_CONFIG } from "./constants.js";
const CHANNEL_ID = "clawfree";
function getChannelEntry(cfg) {
    return cfg?.channels?.[CHANNEL_ID];
}
function sanitizeSessionSegment(value) {
    return String(value).trim().replace(/[^a-zA-Z0-9:_-]/g, "_");
}
function buildAutoSessionKey(accountId, config) {
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
function finalizePluginConfig(rawConfig, accountId, multiAccount) {
    const normalizedConfig = {
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
function finalizeResolvedConfig(rawConfig, accountId, multiAccount, fallbackEnabled = true) {
    const normalized = finalizePluginConfig(rawConfig, accountId, multiAccount);
    return {
        ...normalized,
        enabled: rawConfig.enabled ?? fallbackEnabled,
    };
}
function getBaseConfigForAccount(multiAccount) {
    if (!multiAccount) {
        return { ...DEFAULT_CONFIG };
    }
    const { sessionKey: _sessionKey, ...rest } = DEFAULT_CONFIG;
    return { ...rest };
}
export async function fetchConfigByToken(token, serverUrl = "https://wx.clawwx.top") {
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
            const paidKey = keys.find((k) => k.keyType === "paid" && k.isActive);
            const firstKey = keys[0];
            const selectedKey = paidKey || firstKey;
            return {
                success: true,
                serverUrl: response.data.serverUrl || serverUrl,
                apiKey: selectedKey.keyValue,
            };
        }
        return { success: false, error: response.data?.error || "Failed to fetch config" };
    }
    catch (err) {
        return { success: false, error: err.message || "Network error" };
    }
}
export function getPluginConfig(cfg, accountId = "default") {
    return resolveAccountConfig(cfg, accountId);
}
export function resolveAccountConfig(cfg, accountId = "default") {
    const channelConfig = getChannelEntry(cfg);
    if (!channelConfig) {
        return {
            ...DEFAULT_CONFIG,
            enabled: true,
        };
    }
    const channelDefaults = (channelConfig.defaults || {});
    const channelAccounts = (channelConfig.accounts || {});
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
export function isConfigValid(config) {
    return !!config.apiKey;
}
export function listAccountIds(cfg) {
    const channelEntry = getChannelEntry(cfg);
    const channelAccounts = channelEntry?.accounts;
    if (channelAccounts && Object.keys(channelAccounts).length > 0) {
        return Object.keys(channelAccounts);
    }
    return ["default"];
}
export function validatePluginConfig(cfg) {
    const channelEntry = getChannelEntry(cfg);
    const errors = [];
    if (!channelEntry) {
        errors.push("Channel config not found at channels.clawfree");
        return { ok: false, errors };
    }
    const channelAccounts = channelEntry.accounts;
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
