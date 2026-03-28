import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
const DEBUG_LOG_FILE = path.join(os.homedir(), ".openclaw", "logs", "clawfree-debug.log");
let testDeps = null;
function appendDebugLog(line) {
    try {
        fs.appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
    }
    catch {
        // ignore debug logging failures
    }
}
function getDeps() {
    if (testDeps) {
        return testDeps;
    }
    return {
        execAsync: execFileAsync,
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        readFileSync: fs.readFileSync,
        copyFileSync: fs.copyFileSync,
        homedir: os.homedir,
        platform: process.platform,
        appData: process.env.APPDATA,
    };
}
function sanitizeSegment(value) {
    return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}
function buildAgentId(accountId, apiKey) {
    const accountSegment = sanitizeSegment(accountId || "default");
    const keySuffix = sanitizeSegment(apiKey.slice(-8));
    return `clawfree_${accountSegment}_${keySuffix}`;
}
function hasRegisteredAgent(agentDir, deps) {
    return deps.existsSync(path.join(agentDir, "models.json"));
}
function shouldRetryWithoutAgent(error) {
    const text = error instanceof Error
        ? `${error.message}\n${error.stack || ""}`
        : String(error || "");
    return text.includes("too many arguments for 'agent'") ||
        text.includes("unknown option '--agent'") ||
        text.includes("Unknown option '--agent'") ||
        text.includes("unknown option '--session-id'") ||
        text.includes("Unknown option '--session-id'");
}
function isAgentAlreadyExistsError(error) {
    const text = error instanceof Error
        ? `${error.message}\n${error.stack || ""}`
        : String(error || "");
    return text.includes("already exists") || text.includes("Agent \"") && text.includes("\" already exists");
}
function buildCommandInvocation(deps, openclawBin, args) {
    return {
        file: openclawBin,
        args,
        options: deps.platform === "win32" ? { shell: true } : {},
    };
}
async function ensureAgentReady(openclawBin, agentId, log) {
    const deps = getDeps();
    const stateDir = path.join(deps.homedir(), ".openclaw");
    const agentDir = path.join(stateDir, "agents", agentId, "agent");
    const workspaceDir = path.join(stateDir, `workspace-${agentId}`);
    const mainAgentDir = path.join(stateDir, "agents", "main", "agent");
    const mainAuthFile = path.join(mainAgentDir, "auth-profiles.json");
    const mainModelsFile = path.join(mainAgentDir, "models.json");
    if (!hasRegisteredAgent(agentDir, deps)) {
        deps.mkdirSync(workspaceDir, { recursive: true });
        const addArgs = ["agents", "add", agentId, "--workspace", workspaceDir, "--non-interactive"];
        const invocation = buildCommandInvocation(deps, openclawBin, addArgs);
        appendDebugLog(`[inject] ensure-agent create file=${invocation.file} args=${JSON.stringify(invocation.args)}`);
        try {
            await deps.execAsync(invocation.file, invocation.args, { timeout: 30000, ...invocation.options });
        }
        catch (error) {
            if (!isAgentAlreadyExistsError(error)) {
                throw error;
            }
            appendDebugLog(`[inject] ensure-agent exists agent=${agentId}`);
        }
    }
    const targetAuthFile = path.join(agentDir, "auth-profiles.json");
    if (deps.existsSync(mainAuthFile)) {
        deps.mkdirSync(agentDir, { recursive: true });
        const source = deps.readFileSync(mainAuthFile, "utf8");
        const target = deps.existsSync(targetAuthFile) ? deps.readFileSync(targetAuthFile, "utf8") : "";
        if (source !== target) {
            deps.copyFileSync(mainAuthFile, targetAuthFile);
            log?.info?.(`Synced auth profile for agent ${agentId}`);
            appendDebugLog(`[inject] ensure-agent synced-auth agent=${agentId}`);
        }
    }
    const targetModelsFile = path.join(agentDir, "models.json");
    if (!deps.existsSync(targetModelsFile) && deps.existsSync(mainModelsFile)) {
        deps.mkdirSync(agentDir, { recursive: true });
        deps.copyFileSync(mainModelsFile, targetModelsFile);
        log?.info?.(`Seeded models.json for agent ${agentId}`);
        appendDebugLog(`[inject] ensure-agent seeded-models agent=${agentId}`);
    }
    if (!hasRegisteredAgent(agentDir, deps)) {
        throw new Error(`Agent ${agentId} is not fully registered`);
    }
}
export async function injectMessage(message, options, log) {
    const { content } = message;
    const { sessionKey, accountId, apiKey } = options;
    const deps = getDeps();
    log?.info?.(`Injecting message to OpenClaw: sessionKey=${sessionKey}, content=${content.substring(0, 30)}...`);
    appendDebugLog(`[inject] start sessionKey=${sessionKey} account=${accountId} content=${content.substring(0, 80)}`);
    try {
        const openclawBin = process.env.OPENCLAW_BIN || (deps.platform === "win32" ? "openclaw.cmd" : "openclaw");
        const sanitizedSessionKey = String(sessionKey).replace(/[^a-zA-Z0-9:_-]/g, "_");
        const agentId = buildAgentId(accountId, apiKey);
        await ensureAgentReady(openclawBin, agentId, log);
        const primaryArgs = ["agent", "--agent", agentId, "--session-id", sanitizedSessionKey, "-m", content, "--json"];
        const fallbackArgs = ["agent", "--session-id", sanitizedSessionKey, "-m", content, "--json"];
        const primaryInvocation = buildCommandInvocation(deps, openclawBin, primaryArgs);
        const fallbackInvocation = buildCommandInvocation(deps, openclawBin, fallbackArgs);
        let stdout = "";
        let stderr = "";
        try {
            appendDebugLog(`[inject] exec file=${primaryInvocation.file} args=${JSON.stringify(primaryInvocation.args)}`);
            ({ stdout, stderr } = await deps.execAsync(primaryInvocation.file, primaryInvocation.args, { timeout: 120000, ...primaryInvocation.options }));
        }
        catch (error) {
            if (!shouldRetryWithoutAgent(error)) {
                throw error;
            }
            log?.warn?.(`OpenClaw agent flags unsupported for ${agentId}, retrying without --agent`);
            appendDebugLog(`[inject] fallback without-agent agent=${agentId} reason=${error instanceof Error ? error.message : String(error)}`);
            appendDebugLog(`[inject] exec file=${fallbackInvocation.file} args=${JSON.stringify(fallbackInvocation.args)}`);
            ({ stdout, stderr } = await deps.execAsync(fallbackInvocation.file, fallbackInvocation.args, { timeout: 120000, ...fallbackInvocation.options }));
        }
        appendDebugLog(`[inject] stdout=${stdout.substring(0, 400)} stderr=${stderr.substring(0, 400)}`);
        log?.info?.(`Message injected, parsing response...`);
        const jsonStart = stdout.indexOf("{");
        if (jsonStart === -1) {
            const fallbackReply = stdout.trim() || null;
            appendDebugLog(`[inject] no-json fallback=${fallbackReply || "<empty>"}`);
            return fallbackReply;
        }
        const jsonStr = stdout.substring(jsonStart);
        const result = JSON.parse(jsonStr);
        let reply = "";
        if (result.result?.payloads?.length) {
            reply = result.result.payloads.map((payload) => payload.text || payload.content || "").join("\n");
        }
        else if (result.reply) {
            reply = result.reply;
        }
        else if (result.text) {
            reply = result.text;
        }
        appendDebugLog(`[inject] reply=${reply || "<empty>"}`);
        return reply || null;
    }
    catch (error) {
        log?.error?.(`Failed to inject message: ${error}`);
        appendDebugLog(`[inject] error=${error instanceof Error ? error.stack || error.message : String(error)}`);
        throw error;
    }
}
export const __test = {
    buildAgentId,
    buildCommandInvocation,
    sanitizeSegment,
    shouldRetryWithoutAgent,
    isAgentAlreadyExistsError,
    setDeps(overrides) {
        const current = getDeps();
        testDeps = {
            ...current,
            ...overrides,
        };
    },
    resetDeps() {
        testDeps = null;
    },
};
