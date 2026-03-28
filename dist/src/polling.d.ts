import type { GatewayStartContext } from "openclaw/plugin-sdk";
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
declare function isSessionScopedValue(value: unknown): value is string;
declare function resolveQueueRouting(msg: QueueMessageLike, fallbackSessionKey: string): {
    sessionId: string;
    replyTarget: string;
};
export declare function startPollingService(ctx: GatewayStartContext): Promise<{
    running: boolean;
    lastStartAt: number;
    cleanup: () => void;
}>;
export declare const __test: {
    isSessionScopedValue: typeof isSessionScopedValue;
    resolveQueueRouting: typeof resolveQueueRouting;
};
export declare function runPollingCleanup(accountId?: string): void;
export {};
