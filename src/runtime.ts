/**
 * Runtime 管理模块
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setClawfreeRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getClawfreeRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("ClawFree runtime not initialized");
  }
  return runtime;
}
