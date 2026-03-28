/**
 * ClawFree channel plugin entry.
 */
import { clawfreePlugin } from "./src/channel.js";
import { setClawfreeRuntime } from "./src/runtime.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./src/constants.js";
const plugin = {
    id: PLUGIN_ID,
    name: "ClawFree",
    description: "ClawFree channel plugin for OpenClaw",
    version: PLUGIN_VERSION,
    configSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
    },
    reload: {
        configPrefixes: ["channels.clawfree"],
    },
    register(api) {
        setClawfreeRuntime(api.runtime);
        api.registerChannel({ plugin: clawfreePlugin });
    },
};
export const register = plugin.register.bind(plugin);
export const activate = plugin.register.bind(plugin);
export default plugin;
