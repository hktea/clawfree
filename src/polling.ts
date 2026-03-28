import type { GatewayStartContext } from "openclaw/plugin-sdk";
import fs from "fs";
import os from "os";
import path from "path";
import WebSocket from "ws";
import { injectMessage } from "./message-injector.js";
import { DEFAULT_CONFIG } from "./constants.js";
import { setClawfreeRuntime } from "./runtime.js";

const activeCleanupByAccount = new Map<string, () => void>();
const activeStateByAccount = new Map<string, { running: boolean; lastStartAt: number; cleanup: () => void }>();
const processedMessageIdsByAccount = new Map<string, Set<string | number>>();
const wsConnections = new Map<string, WebSocket>();

const LONG_POLL_TIMEOUT_SECONDS = 25;
const REQUEST_TIMEOUT_MS = 35_000;
const REALTIME_POLL_INTERVAL_MS = 60_000;
const DEBUG_LOG_FILE = path.join(os.homedir(), ".openclaw", "logs", "clawfree-debug.log");

type PollErrorKind = "auth" | "rate_limit" | "server" | "network" | "abort" | "unknown";

type PollError = {
  kind: PollErrorKind;
  message: string;
  status?: number;
  retriable: boolean;
  stopAccount: boolean;
};

type PollHealth = {
  pollCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastErrorAt?: number;
};

type LoggerLike = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

type QueueMessageLike = {
  id?: string | number;
  messageId?: string | number;
  from?: string;
  openid?: string;
  userId?: string;
  content?: string;
  text?: string;
  timestamp?: number;
  sessionId?: string;
};

function isSessionScopedValue(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return value.startsWith("custom_") || value.startsWith("paid_");
}

function resolveQueueRouting(msg: QueueMessageLike, fallbackSessionKey: string) {
  const sessionId = isSessionScopedValue(msg.sessionId)
    ? msg.sessionId
    : isSessionScopedValue(msg.from)
      ? msg.from
      : fallbackSessionKey;
  const replyTarget = String(msg.from ?? msg.openid ?? msg.userId ?? "");

  return {
    sessionId,
    replyTarget,
  };
}

function getProcessedMessageIds(accountId: string): Set<string | number> {
  let ids = processedMessageIdsByAccount.get(accountId);
  if (!ids) {
    ids = new Set<string | number>();
    processedMessageIdsByAccount.set(accountId, ids);
  }
  return ids;
}

function appendDebugLog(line: string) {
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // ignore debug logging failures
  }
}

function buildJitteredDelay(baseDelayMs: number): number {
  const jitter = Math.round(baseDelayMs * 0.2 * Math.random());
  return Math.max(500, baseDelayMs + jitter);
}

function getRetryDelayMs(kind: PollErrorKind, pollIntervalMs: number): number {
  if (kind === "rate_limit") {
    return buildJitteredDelay(Math.max(30_000, pollIntervalMs * 6));
  }

  if (kind === "server" || kind === "network") {
    return buildJitteredDelay(Math.max(10_000, pollIntervalMs * 2));
  }

  return buildJitteredDelay(pollIntervalMs);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  abortSignal: AbortSignal,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onAbort = () => timeoutController.abort();
  abortSignal.addEventListener("abort", onAbort);

  try {
    return await fetch(url, {
      ...options,
      signal: timeoutController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    abortSignal.removeEventListener("abort", onAbort);
  }
}

function classifyPollError(error: unknown): PollError {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg === "ABORTED" || msg.includes("aborted")) {
    return { kind: "abort", message: msg, retriable: false, stopAccount: false };
  }

  if (msg.startsWith("HTTP_")) {
    const status = Number(msg.replace("HTTP_", ""));
    if (status === 401 || status === 403) {
      return { kind: "auth", message: `HTTP ${status}`, status, retriable: false, stopAccount: true };
    }
    if (status === 429) {
      return { kind: "rate_limit", message: "HTTP 429", status, retriable: true, stopAccount: false };
    }
    if (status >= 500) {
      return { kind: "server", message: `HTTP ${status}`, status, retriable: true, stopAccount: false };
    }
  }

  if (msg.includes("fetch") || msg.includes("network") || msg.includes("timed out")) {
    return { kind: "network", message: msg, retriable: true, stopAccount: false };
  }

  return { kind: "unknown", message: msg, retriable: true, stopAccount: false };
}

function getOrCreateWebSocket(
  serverUrl: string,
  apiKey: string,
  accountId: string,
  log?: LoggerLike,
  clientType = "openclaw",
): WebSocket {
  const key = `${serverUrl}:${accountId}:${clientType}`;
  const existing = wsConnections.get(key);

  if (existing) {
    if (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING) {
      return existing;
    }
    existing.close();
    wsConnections.delete(key);
  }

  const wsUrl = `${serverUrl.replace(/^http/, "ws")}/ws?apiKey=${encodeURIComponent(apiKey)}&clientType=${encodeURIComponent(clientType)}`;
  appendDebugLog(`[poll] ws-connect account=${accountId} url=${wsUrl}`);
  log?.info?.(`[${accountId}] Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    appendDebugLog(`[poll] ws-open account=${accountId}`);
    log?.info?.(`[${accountId}] WebSocket connected`);
  });

  ws.on("close", (code: number, reason: Buffer) => {
    appendDebugLog(`[poll] ws-close account=${accountId} code=${code} reason=${String(reason)}`);
    log?.info?.(`[${accountId}] WebSocket closed code=${code}`);
    wsConnections.delete(key);
  });

  ws.on("error", (err: Error) => {
    appendDebugLog(`[poll] ws-error account=${accountId} error=${err.message}`);
    log?.error?.(`[${accountId}] WebSocket error: ${err.message}`);
  });

  wsConnections.set(key, ws);
  return ws;
}

function sendViaWebSocket(ws: WebSocket, to: string, content: string, originalTimestamp?: number): boolean {
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  ws.send(JSON.stringify({
    type: "response",
    to,
    content,
    originalTimestamp,
  }));

  return true;
}

function getNextPollDelay(
  serverUrl: string,
  apiKey: string,
  accountId: string,
  pollInterval: number,
  log?: LoggerLike,
): number {
  getOrCreateWebSocket(serverUrl, apiKey, accountId, log, "openclaw_polling");
  return pollInterval;
}

export async function startPollingService(ctx: GatewayStartContext) {
  const { account, abortSignal, log, deps } = ctx;

  const existingState = activeStateByAccount.get(account.accountId);
  if (existingState?.running) {
    appendDebugLog(`[poll] reuse-existing account=${account.accountId}`);
    log?.info?.(`[${account.accountId}] Reusing existing polling service`);
    return existingState;
  }

  appendDebugLog(`[poll] start account=${account.accountId} deps=${!!deps} runtime=${!!deps?.runtime}`);
  log?.info?.(`[clawfree] Starting polling service. deps: ${!!deps}, runtime: ${!!deps?.runtime}`);

  if (deps?.runtime) {
    setClawfreeRuntime(deps.runtime);
    appendDebugLog(`[poll] runtime-set account=${account.accountId}`);
    log?.info?.(`[clawfree] Runtime set successfully`);
  } else {
    appendDebugLog(`[poll] runtime-missing account=${account.accountId}`);
    log?.error?.(`[clawfree] Runtime not available in deps!`);
  }

  const config = account.config;
  const serverUrl = config.serverUrl || DEFAULT_CONFIG.serverUrl;
  const apiKey = config.apiKey;
  const pollInterval = config.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs;
  const sessionKey = config.sessionKey || DEFAULT_CONFIG.sessionKey;
  const debug = config.debug ?? DEFAULT_CONFIG.debug;

  log?.info?.(`[${account.accountId}] Starting ClawFree polling service`);
  appendDebugLog(`[poll] config account=${account.accountId} server=${serverUrl} pollMs=${pollInterval} sessionKey=${sessionKey}`);

  if (!apiKey) {
    appendDebugLog(`[poll] missing-api-key account=${account.accountId}`);
    throw new Error("API Key not configured");
  }

  try {
    getOrCreateWebSocket(serverUrl, apiKey, account.accountId, log, "openclaw_polling");
    appendDebugLog(`[poll] ws-register-started account=${account.accountId}`);
  } catch (error) {
    appendDebugLog(`[poll] ws-register-error account=${account.accountId} error=${error instanceof Error ? error.message : String(error)}`);
    log?.warn?.(`[${account.accountId}] Failed to connect WebSocket on start: ${error}`);
  }

  let offset = 0;
  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let accountBlocked = false;
  let historyDrainCompleted = false;
  const processedMessageIds = getProcessedMessageIds(account.accountId);
  const health: PollHealth = {
    pollCount: 0,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
  };

  const scheduleNext = (delayMs: number) => {
    if (!abortSignal.aborted && !stopped && !accountBlocked) {
      pollingTimer = setTimeout(poll, delayMs);
    }
  };

  const poll = async () => {
    if (abortSignal.aborted || stopped || accountBlocked) {
      appendDebugLog(`[poll] stopped account=${account.accountId} aborted=${abortSignal.aborted} blocked=${accountBlocked}`);
      log?.info?.(`[${account.accountId}] Polling stopped (aborted)`);
      return;
    }

    health.pollCount += 1;
    const pollUrl = `${serverUrl}/api/clawpoll?offset=${offset}&timeout=${LONG_POLL_TIMEOUT_SECONDS}`;

    if (debug && health.pollCount % 10 === 0) {
      log?.info?.(
        `[${account.accountId}] Polling #${health.pollCount}: offset=${offset}, consecutiveFailures=${health.consecutiveFailures}`,
      );
    }

    appendDebugLog(`[poll] request account=${account.accountId} count=${health.pollCount} offset=${offset}`);

    try {
      const response = await fetchWithTimeout(
        pollUrl,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
        },
        REQUEST_TIMEOUT_MS,
        abortSignal,
      );

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const data = await response.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      appendDebugLog(`[poll] response account=${account.accountId} count=${messages.length} nextOffset=${data.offset ?? offset}`);

      if (!historyDrainCompleted) {
        historyDrainCompleted = true;
        if (messages.length > 0) {
          appendDebugLog(`[poll] skip-initial-backlog account=${account.accountId} count=${messages.length} nextOffset=${data.offset ?? offset}`);
          log?.info?.(`[${account.accountId}] Skipping ${messages.length} queued historical message(s) on startup`);
          if (data.offset !== undefined) {
            offset = data.offset;
          }
          health.successCount += 1;
          health.consecutiveFailures = 0;
          health.lastSuccessAt = Date.now();
          scheduleNext(getNextPollDelay(serverUrl, apiKey, account.accountId, pollInterval, log));
          return;
        }
      }

      for (const msg of messages) {
        const msgId = msg.id || msg.messageId;
        const { sessionId: targetSessionId, replyTarget } = resolveQueueRouting(msg, sessionKey);
        const from = replyTarget;
        const content = msg.content || msg.text || "";

        if (msgId && processedMessageIds.has(msgId)) {
          appendDebugLog(`[poll] skip-duplicate account=${account.accountId} msgId=${msgId}`);
          continue;
        }

        if (msgId) {
          processedMessageIds.add(msgId);
        }

        appendDebugLog(`[poll] process account=${account.accountId} msgId=${msgId} from=${from} content=${String(content).substring(0, 80)}`);

        try {
          const reply = await injectMessage(
            {
              userId: String(from ?? ""),
              content: String(content),
              messageId: msgId,
            },
            {
              accountId: account.accountId,
              apiKey,
              sessionKey: targetSessionId,
              serverUrl,
            },
            log,
          );

          appendDebugLog(`[poll] reply-generated account=${account.accountId} msgId=${msgId} hasReply=${!!reply}`);

          if (reply) {
            const ws = getOrCreateWebSocket(serverUrl, apiKey, account.accountId, log, "openclaw_polling");
            const sent = sendViaWebSocket(ws, String(from ?? ""), reply, msg.timestamp);

            if (sent) {
              appendDebugLog(`[poll] reply-ws-sent account=${account.accountId} msgId=${msgId}`);
              log?.info?.(`[${account.accountId}] Reply sent via WebSocket to ${from}`);
            } else {
              appendDebugLog(`[poll] reply-ws-unavailable account=${account.accountId} msgId=${msgId}`);
              log?.warn?.(`[${account.accountId}] WebSocket not connected, trying HTTP...`);

              const httpResponse = await fetch(`${serverUrl}/api/clawsend`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": apiKey,
                },
                body: JSON.stringify({
                  to: from,
                  content: reply,
                  messageId: msgId,
                  sessionId: targetSessionId,
                }),
              });

              const httpText = await httpResponse.text();
              appendDebugLog(`[poll] reply-http status=${httpResponse.status} body=${httpText.substring(0, 400)}`);

              if (!httpResponse.ok) {
                throw new Error(`HTTP_SEND_${httpResponse.status}`);
              }

              log?.info?.(`[${account.accountId}] Reply sent via HTTP`);
            }
          } else {
            appendDebugLog(`[poll] empty-reply account=${account.accountId} msgId=${msgId}`);
          }

          log?.info?.(`[${account.accountId}] Processed message: ${String(content).substring(0, 30)}...`);
        } catch (error) {
          appendDebugLog(`[poll] process-error account=${account.accountId} msgId=${msgId} error=${error instanceof Error ? error.stack || error.message : String(error)}`);
          log?.error?.(`[${account.accountId}] Failed to process message: ${error}`);
        }
      }

      if (data.offset !== undefined) {
        offset = data.offset;
      }

      health.successCount += 1;
      health.consecutiveFailures = 0;
      health.lastSuccessAt = Date.now();
      scheduleNext(getNextPollDelay(serverUrl, apiKey, account.accountId, pollInterval, log));
    } catch (error) {
      const classified = classifyPollError(error);
      if (classified.kind === "abort" || abortSignal.aborted || stopped) {
        appendDebugLog(`[poll] abort account=${account.accountId}`);
        return;
      }

      health.failureCount += 1;
      health.consecutiveFailures += 1;
      health.lastErrorAt = Date.now();
      appendDebugLog(`[poll] error account=${account.accountId} kind=${classified.kind} message=${classified.message}`);

      if (classified.stopAccount) {
        accountBlocked = true;
        log?.error?.(`[${account.accountId}] Polling stopped due to auth error. Please check API Key.`);
        return;
      }

      const retryDelay = getRetryDelayMs(classified.kind, pollInterval);
      log?.warn?.(
        `[${account.accountId}] Polling error kind=${classified.kind}, message=${classified.message}; retry in ${retryDelay}ms`,
      );
      scheduleNext(retryDelay);
    }
  };

  poll();

  const cleanup = () => {
    stopped = true;
    accountBlocked = true;
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }

    for (const [key, ws] of wsConnections.entries()) {
      if (key.startsWith(`${serverUrl}:${account.accountId}:`)) {
        try {
          ws.close();
        } catch {
          // ignore socket cleanup errors
        }
        wsConnections.delete(key);
      }
    }

    appendDebugLog(`[poll] cleanup account=${account.accountId}`);
    activeCleanupByAccount.delete(account.accountId);
    activeStateByAccount.delete(account.accountId);
    processedMessageIdsByAccount.delete(account.accountId);
    log?.info?.(`[${account.accountId}] Polling service cleaned up`);
  };

  activeCleanupByAccount.set(account.accountId, cleanup);

  const runtimeState = {
    running: true,
    lastStartAt: Date.now(),
    cleanup,
  };
  activeStateByAccount.set(account.accountId, runtimeState);

  return runtimeState;
}

export const __test = {
  isSessionScopedValue,
  resolveQueueRouting,
};

export function runPollingCleanup(accountId?: string): void {
  if (accountId) {
    const cleanup = activeCleanupByAccount.get(accountId);
    if (cleanup) {
      cleanup();
      activeCleanupByAccount.delete(accountId);
    }
    activeStateByAccount.delete(accountId);
    processedMessageIdsByAccount.delete(accountId);
    return;
  }

  for (const [id, cleanup] of activeCleanupByAccount.entries()) {
    cleanup();
    activeCleanupByAccount.delete(id);
    activeStateByAccount.delete(id);
    processedMessageIdsByAccount.delete(id);
  }
}
