declare module "openclaw/plugin-sdk" {
  export interface PluginRuntime {
    config?: {
      loadConfig?: () => unknown;
    };
    gateway?: {
      call?: (method: string, payload: unknown) => Promise<any>;
    };
  }

  export interface OpenClawPluginApi {
    runtime: PluginRuntime;
    registerChannel: (input: { plugin: unknown }) => void;
  }

  export interface ChannelPluginConfig {
    channels?: Record<string, unknown>;
    plugins?: {
      entries?: Record<string, unknown>;
    };
  }

  export interface OpenClawConfig extends ChannelPluginConfig {}

  export interface ChannelMeta {
    id?: string;
    label: string;
    selectionLabel: string;
    docsPath?: string;
    blurb?: string;
    aliases?: string[];
    preferOver?: string[];
    detailLabel?: string;
    systemImage?: string;
  }

  export interface ChannelConfig<TAccount> {
    listAccountIds: (cfg: unknown) => string[];
    resolveAccount: (cfg: unknown, accountId: string) => TAccount;
    isConfigured: (account: TAccount) => boolean;
    describeAccount: (account: TAccount) => unknown;
  }

  export interface ChannelInbound<TAccount> {
    receiveMessage: (ctx: any) => Promise<unknown>;
  }

  export interface ChannelOutbound<TAccount> {
    deliveryMode: string;
    resolveTarget: (input: { to?: string }) => { ok: boolean; to?: string; error?: Error };
    sendText: (ctx: any) => Promise<unknown>;
    sendMedia: (ctx: any) => Promise<unknown>;
  }

  export interface ChannelStatus<TAccount, TProbe> {
    defaultRuntime: Record<string, unknown>;
    buildChannelSummary: (input: { snapshot: any }) => unknown;
    buildAccountSnapshot: (input: { account: TAccount; cfg: unknown; runtime: any }) => unknown;
  }

  export interface GatewayStartContext {
    account: {
      accountId: string;
      config: Record<string, any>;
    };
    abortSignal: AbortSignal;
    log?: {
      info?: (msg: string) => void;
      warn?: (msg: string) => void;
      error?: (msg: string) => void;
    };
    deps?: {
      runtime?: PluginRuntime;
    };
  }

  export interface ChannelGateway<TAccount> {
    startAccount: (ctx: any) => Promise<any>;
    stopAccount: (ctx: any) => Promise<any>;
  }

  export interface ChannelPlugin<TAccount, TProbe> {
    id: string;
    meta: ChannelMeta;
    capabilities: Record<string, unknown>;
    config: ChannelConfig<TAccount>;
    inbound: ChannelInbound<TAccount>;
    outbound: ChannelOutbound<TAccount>;
    status: ChannelStatus<TAccount, TProbe>;
    gateway: ChannelGateway<TAccount>;
    messaging?: Record<string, unknown>;
  }
}
