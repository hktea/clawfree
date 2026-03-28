import fs from "fs";
import os from "os";
type ExecLike = (file: string, args?: string[], options?: {
    timeout?: number;
    shell?: boolean;
}) => Promise<{
    stdout: string;
    stderr: string;
}>;
type TestDeps = {
    execAsync: ExecLike;
    existsSync: typeof fs.existsSync;
    mkdirSync: typeof fs.mkdirSync;
    readFileSync: typeof fs.readFileSync;
    copyFileSync: typeof fs.copyFileSync;
    homedir: typeof os.homedir;
    platform: NodeJS.Platform;
    appData?: string;
};
type MessageInfo = {
    userId: string;
    content: string;
    messageId?: string | number;
};
type InjectOptions = {
    accountId: string;
    apiKey: string;
    sessionKey: string;
    serverUrl: string;
};
type LoggerLike = {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
};
declare function sanitizeSegment(value: string): string;
declare function buildAgentId(accountId: string, apiKey: string): string;
declare function shouldRetryWithoutAgent(error: unknown): boolean;
declare function isAgentAlreadyExistsError(error: unknown): boolean;
declare function buildCommandInvocation(deps: TestDeps, openclawBin: string, args: string[]): {
    file: string;
    args: string[];
    options: {
        shell: boolean;
    } | {
        shell?: undefined;
    };
};
export declare function injectMessage(message: MessageInfo, options: InjectOptions, log?: LoggerLike): Promise<string | null>;
export declare const __test: {
    buildAgentId: typeof buildAgentId;
    buildCommandInvocation: typeof buildCommandInvocation;
    sanitizeSegment: typeof sanitizeSegment;
    shouldRetryWithoutAgent: typeof shouldRetryWithoutAgent;
    isAgentAlreadyExistsError: typeof isAgentAlreadyExistsError;
    setDeps(overrides: Partial<TestDeps>): void;
    resetDeps(): void;
};
export {};
