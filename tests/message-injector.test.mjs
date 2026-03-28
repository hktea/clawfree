import assert from "node:assert/strict";

import { __test, injectMessage } from "../dist/src/message-injector.js";

function run(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`ok - ${name}`);
      });
    }
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await run("buildAgentId sanitizes account id and key suffix", () => {
  assert.equal(
    __test.buildAgentId("sales team", "oc_xxx_12345678"),
    "clawfree_sales_team_12345678",
  );
});

await run("injectMessage creates missing agent and parses payload reply", async () => {
  const commands = [];
  const copies = [];
  let agentCreated = false;

  __test.setDeps({
    platform: "win32",
    appData: "C:\\Users\\Administrator\\AppData\\Roaming",
    homedir: () => "C:\\Users\\Administrator",
    existsSync: (target) => {
      const normalized = String(target).replace(/\\/g, "/");
      if (normalized.endsWith("/agents/main/agent/auth-profiles.json")) {
        return true;
      }
      if (normalized.endsWith("/agents/clawfree_sales_team_12345678/agent/models.json")) {
        return agentCreated;
      }
      return false;
    },
    mkdirSync: () => undefined,
    readFileSync: (target) => {
      if (String(target).includes("main")) {
        return "{\"profiles\":[]}";
      }
      return "";
    },
    copyFileSync: (from, to) => {
      copies.push({ from, to });
    },
    execAsync: async (file, args) => {
      commands.push({ file, args });
      const serialized = JSON.stringify(args || []);
      if (serialized.includes("agents") && serialized.includes("add")) {
        agentCreated = true;
        return { stdout: "", stderr: "" };
      }
      return {
        stdout: JSON.stringify({
          result: {
            payloads: [{ text: "reply text" }],
          },
        }),
        stderr: "",
      };
    },
  });

  try {
    const reply = await injectMessage(
      { userId: "user-1", content: "hello" },
      {
        accountId: "sales team",
        apiKey: "oc_xxx_12345678",
        sessionKey: "agent:test:session",
        serverUrl: "https://example.com",
      },
      {},
    );

    assert.equal(reply, "reply text");
    assert.equal(commands.length, 2);
    assert.match(commands[0].file, /openclaw\.cmd/i);
    assert.deepEqual(commands[0].args, [
      "agents",
      "add",
      "clawfree_sales_team_12345678",
      "--workspace",
      "C:\\Users\\Administrator\\.openclaw\\workspace-clawfree_sales_team_12345678",
      "--non-interactive",
    ]);
    assert.deepEqual(commands[1].args, [
      "agent",
      "--agent",
      "clawfree_sales_team_12345678",
      "--session-id",
      "agent:test:session",
      "-m",
      "hello",
      "--json",
    ]);
    assert.equal(copies.length, 1);
  } finally {
    __test.resetDeps();
  }
});

await run("injectMessage falls back to plain stdout when JSON is absent", async () => {
  __test.setDeps({
    platform: "linux",
    homedir: () => "/home/tester",
    existsSync: () => true,
    mkdirSync: () => undefined,
    readFileSync: () => "",
    copyFileSync: () => undefined,
    execAsync: async () => ({
      stdout: "plain reply",
      stderr: "",
    }),
  });

  try {
    const reply = await injectMessage(
      { userId: "user-1", content: "hello" },
      {
        accountId: "default",
        apiKey: "oc_xxx_12345678",
        sessionKey: "agent:test:session",
        serverUrl: "https://example.com",
      },
      {},
    );

    assert.equal(reply, "plain reply");
  } finally {
    __test.resetDeps();
  }
});

await run("injectMessage retries without --agent when CLI rejects agent flags", async () => {
  const commands = [];

  __test.setDeps({
    platform: "linux",
    homedir: () => "/home/tester",
    existsSync: () => true,
    mkdirSync: () => undefined,
    readFileSync: () => "",
    copyFileSync: () => undefined,
    execAsync: async (file, args) => {
      commands.push({ file, args });
      const serialized = JSON.stringify(args || []);
      if (serialized.includes("--agent")) {
        throw new Error("error: too many arguments for 'agent'. Expected 0 arguments but got 4.");
      }
      return {
        stdout: JSON.stringify({
          result: {
            payloads: [{ text: "fallback reply" }],
          },
        }),
        stderr: "",
      };
    },
  });

  try {
    const reply = await injectMessage(
      { userId: "user-1", content: "hello" },
      {
        accountId: "default",
        apiKey: "oc_xxx_12345678",
        sessionKey: "agent:test:session",
        serverUrl: "https://example.com",
      },
      {},
    );

    assert.equal(reply, "fallback reply");
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[0].args, [
      "agent",
      "--agent",
      "clawfree_default_12345678",
      "--session-id",
      "agent:test:session",
      "-m",
      "hello",
      "--json",
    ]);
    assert.doesNotMatch((commands[1].args || []).join(" "), /--agent clawfree_default_12345678/);
    assert.deepEqual(commands[1].args, [
      "agent",
      "--session-id",
      "agent:test:session",
      "-m",
      "hello",
      "--json",
    ]);
  } finally {
    __test.resetDeps();
  }
});

console.log("All clawfree message injector tests passed.");
