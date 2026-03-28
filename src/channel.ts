/**
 * Channel Plugin 实现
 * 
 * ClawFree 通道插件核心
 */

import type {
  ChannelPlugin,
  ChannelConfig,
  ChannelInbound,
  ChannelOutbound,
  ChannelStatus,
  ChannelGateway,
  ChannelMeta,
  GatewayStartContext,
} from "openclaw/plugin-sdk";
import { getClawfreeRuntime } from "./runtime.js";
import { startPollingService, runPollingCleanup } from "./polling.js";
import { CHANNEL_ID, DEFAULT_CONFIG } from "./constants.js";
import {
  getPluginConfig,
  isConfigValid,
  listAccountIds as listAccountIdsFromConfig,
  resolveAccountConfig,
  validatePluginConfig,
  fetchConfigByToken,
  type PluginConfig,
} from "./config.js";

// ==================== 类型定义 ====================

interface ClawfreeAccount {
  accountId: string;
  enabled: boolean;
  config: PluginConfig;
}

interface ClawfreeProbe {
  ok: boolean;
}

type LoggerLike = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

type ReceiveMessageContextLike = {
  message: {
    from?: { id?: string | number; username?: string };
    content?: string;
    text?: string;
    id?: string | number;
    timestamp?: number;
  };
  accountId?: string;
  deps?: {
    runtime?: ReturnType<typeof getClawfreeRuntime>;
    config?: unknown;
  };
  log?: LoggerLike;
};

type SendContextLike = {
  to: string;
  text?: string;
  mediaUrl?: string;
  accountId?: string;
  cfg?: unknown;
  replyToId?: string | number;
  log?: LoggerLike;
};

// ==================== Meta 配置 ====================

const meta: ChannelMeta = {
  id: CHANNEL_ID,
  label: "ClawFree",
  selectionLabel: "ClawFree",
  docsPath: "/channels/clawfree",
  blurb: "ClawFree service channel - connect to ClawFree server or use local OpenClaw",
  aliases: ["clawfree", "cf"],
};

const capabilities = {
  chatTypes: ["direct"],
  reactions: false,
  threads: false,
  media: true,
  nativeCommands: false,
  blockStreaming: true,
};

// ==================== Config 实现 ====================

const config: ChannelConfig<ClawfreeAccount> = {
  listAccountIds: (cfg: unknown) => {
    return listAccountIdsFromConfig(cfg);
  },

  resolveAccount: (cfg: unknown, accountId: string) => {
    const resolvedAccountId = accountId || "default";
    const pluginConfig = resolveAccountConfig(cfg, resolvedAccountId);

    return {
      accountId: resolvedAccountId,
      enabled: pluginConfig.enabled,
      config: pluginConfig,
    };
  },

  isConfigured: (account: ClawfreeAccount) => {
    return isConfigValid(account.config as PluginConfig);
  },

  describeAccount: (account: ClawfreeAccount) => ({
    accountId: account.accountId,
    enabled: account.enabled,
    configured: isConfigValid(account.config as PluginConfig),
  }),
};

// ==================== Inbound 实现 ====================

export const inbound: ChannelInbound<ClawfreeAccount> = {
  receiveMessage: async (ctx: ReceiveMessageContextLike) => {
    const { message, accountId, deps } = ctx;
    const runtime = deps?.runtime || getClawfreeRuntime();
    const cfg = runtime.config?.loadConfig?.();

    const userMessage = {
      userId: String(message.from?.id ?? message.from?.username ?? ""),
      content: message.content || message.text,
      messageId: message.id,
      timestamp: message.timestamp || Date.now(),
    };

    const resolvedAccountId = accountId || "default";
    const pluginConfig = getPluginConfig(deps?.config ?? cfg, resolvedAccountId);
    
    const sessionKey = pluginConfig.sessionKey || "agent:main:main";

    // 调用 OpenClaw Gateway API
    try {
      if (!runtime?.gateway?.call) {
        ctx.log?.error?.(`Gateway API not available`);
        throw new Error("Gateway API not available");
      }

      const result = await runtime.gateway.call('chat.send', {
        sessionKey,
        message: userMessage.content,
      });

      return {
        channel: CHANNEL_ID,
        messageId: result.messageId || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`Failed to send message to OpenClaw: ${error}`);
      throw error;
    }
  },
};

// ==================== Outbound 实现 ====================

export const outbound: ChannelOutbound<ClawfreeAccount> = {
  deliveryMode: "direct",

  resolveTarget: ({ to }: { to?: string }) => {
    const trimmed = to?.trim() ?? "";
    if (!trimmed) {
      return {
        ok: false,
        error: new Error(`Target is required for ClawFree`),
      };
    }
    return { ok: true, to: trimmed };
  },

  sendText: async (ctx: SendContextLike) => {
    const { to, text, accountId, cfg } = ctx;
    const pluginConfig = getPluginConfig(cfg, accountId || "default");
    const serverUrl = pluginConfig.serverUrl || DEFAULT_CONFIG.serverUrl;
    const apiKey = pluginConfig.apiKey;

    if (!apiKey) {
      throw new Error("API Key not configured");
    }

    // 调用 ClawFree 服务器 API
    try {
      const response = await fetch(`${serverUrl}/api/clawsend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          to,
          content: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        channel: CHANNEL_ID,
        messageId: data.messageId || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`Failed to send text message: ${error}`);
      throw error;
    }
  },

  sendMedia: async (ctx: SendContextLike) => {
    const { to, text, mediaUrl, accountId, cfg } = ctx;
    const pluginConfig = getPluginConfig(cfg, accountId || "default");
    const serverUrl = pluginConfig.serverUrl || DEFAULT_CONFIG.serverUrl;
    const apiKey = pluginConfig.apiKey;

    if (!apiKey) {
      throw new Error("API Key not configured");
    }

    if (!mediaUrl) {
      throw new Error("Media URL is required");
    }

    // 调用 ClawFree 服务器媒体发送 API
    try {
      const response = await fetch(`${serverUrl}/api/clawsend/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          to,
          content: text,
          mediaUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send media: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        channel: CHANNEL_ID,
        messageId: data.messageId || String(Date.now()),
      };
    } catch (error) {
      ctx.log?.error?.(`Failed to send media message: ${error}`);
      throw error;
    }
  },
};

// ==================== Status 实现 ====================

const status: ChannelStatus<ClawfreeAccount, ClawfreeProbe> = {
  defaultRuntime: {
    accountId: "default",
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  },

  buildChannelSummary: ({ snapshot }: { snapshot: any }) => ({
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  }),

  buildAccountSnapshot: ({ account, cfg: _cfg, runtime }: { account: ClawfreeAccount; cfg: unknown; runtime: any }) => {
    return {
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isConfigValid(account.config as PluginConfig),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    };
  },
};

// ==================== Gateway 实现 ====================

const gateway: ChannelGateway<ClawfreeAccount> = {
  startAccount: async (ctx: GatewayStartContext & { account: ClawfreeAccount; cfg?: unknown }) => {
    const { account } = ctx;

    ctx.log?.info?.(`[${account.accountId}] Starting ClawFree account`);

    const validation = validatePluginConfig(ctx.cfg ?? ctx.deps?.runtime?.config?.loadConfig?.());
    if (!validation.ok) {
      const errorMsg = validation.errors.join("; ");
      ctx.log?.error?.(`[${account.accountId}] Invalid plugin config: ${errorMsg}`);
      throw new Error(`Invalid plugin config: ${errorMsg}`);
    }

    if (!account.config.apiKey?.trim() && (account.config as PluginConfig).token?.trim()) {
      const token = (account.config as PluginConfig).token!.trim();
      const serverUrl = account.config.serverUrl?.trim() || DEFAULT_CONFIG.serverUrl;
      const autoConfig = await fetchConfigByToken(token, serverUrl);

      if (!autoConfig.success || !autoConfig.apiKey) {
        throw new Error(autoConfig.error || "Failed to fetch API Key by token");
      }

      account.config.apiKey = autoConfig.apiKey;
      ctx.log?.info?.(`[${account.accountId}] API Key loaded via token`);
    }

    if (!account.config.apiKey?.trim()) {
      throw new Error("API Key not configured");
    }

    // 启动轮询服务
    return await startPollingService(ctx);
  },

  stopAccount: async (ctx: { account: ClawfreeAccount; log?: LoggerLike }) => {
    const { account } = ctx;

    ctx.log?.info?.(`[${account.accountId}] Stopping ClawFree account`);

    runPollingCleanup(account.accountId);

    return {
      running: false,
      lastStopAt: Date.now(),
    };
  },
};

// ==================== Channel Plugin 导出 ====================

export const clawfreePlugin: ChannelPlugin<ClawfreeAccount, ClawfreeProbe> = {
  id: CHANNEL_ID,
  meta,
  capabilities,
  config,
  inbound,
  outbound,
  status,
  gateway,
  messaging: {
    normalizeTarget: (raw: string) => raw.trim() || undefined,
    targetResolver: {
      looksLikeId: (raw: string) => !!raw.trim(),
      hint: "<userId>",
    },
  },
};
