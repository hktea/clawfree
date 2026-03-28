/**
 * ClawFree channel plugin entry.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    version: string;
    configSchema: {
        type: string;
        additionalProperties: boolean;
        properties: {};
    };
    reload: {
        configPrefixes: string[];
    };
    register(api: OpenClawPluginApi): void;
};
export declare const register: (api: OpenClawPluginApi) => void;
export declare const activate: (api: OpenClawPluginApi) => void;
export default plugin;
