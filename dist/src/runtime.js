/**
 * Runtime 管理模块
 */
let runtime = null;
export function setClawfreeRuntime(next) {
    runtime = next;
}
export function getClawfreeRuntime() {
    if (!runtime) {
        throw new Error("ClawFree runtime not initialized");
    }
    return runtime;
}
