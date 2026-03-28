/**
 * ClawFree - OpenClaw 插件
 * 负责接收 ClawSV 转发的消息，调用 OpenClaw Agent，返回响应
 */
import { EventEmitter } from 'events';
export declare class ClawFreeChannel extends EventEmitter {
    private config;
    private name;
    private initialized;
    private ws;
    private reconnectTimer;
    private messageQueue;
    constructor(config: any);
    start(): Promise<void>;
    private connectWebSocket;
    private scheduleReconnect;
    private handleServerMessage;
    private callLocalOpenClaw;
    private sendResponse;
    stop(): Promise<void>;
    sendMessage(content: string, sessionId: string): Promise<any>;
    getChannelId(): string;
    handleMessage(message: string, context: any): Promise<{
        content: string;
        from: string;
        timestamp: number;
    }>;
}
export declare function createChannel(config: any): ClawFreeChannel;
