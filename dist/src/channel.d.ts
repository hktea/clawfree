/**
 * Channel Plugin 实现
 *
 * ClawFree 通道插件核心
 */
import type { ChannelPlugin, ChannelInbound, ChannelOutbound } from "openclaw/plugin-sdk";
import { type PluginConfig } from "./config.js";
interface ClawfreeAccount {
    accountId: string;
    enabled: boolean;
    config: PluginConfig;
}
interface ClawfreeProbe {
    ok: boolean;
}
export declare const inbound: ChannelInbound<ClawfreeAccount>;
export declare const outbound: ChannelOutbound<ClawfreeAccount>;
export declare const clawfreePlugin: ChannelPlugin<ClawfreeAccount, ClawfreeProbe>;
export {};
