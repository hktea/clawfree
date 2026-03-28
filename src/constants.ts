/**
 * ClawFree 插件常量定义
 */

export const PLUGIN_VERSION = "1.0.0";

export const PLUGIN_ID = "clawfree";

export const CHANNEL_ID = "clawfree";

export const DEFAULT_CONFIG = {
  serverUrl: "https://wx.clawwx.top",
  pollIntervalMs: 5000,
  sessionKey: "agent:main:main",
  debug: false,
  mode: "public",
} as const;
