import assert from "node:assert/strict";
import axios from "axios";

import { clawfreePlugin, inbound, outbound } from "../dist/src/channel.js";

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

await run("channel config resolves account enablement from channels.clawfree", () => {
  const account = clawfreePlugin.config.resolveAccount({
    channels: {
      clawfree: {
        enabled: false,
        apiKey: "oc_xxx",
        serverUrl: "https://example.com",
      },
    },
  }, "default");

  assert.equal(account.enabled, false);
  assert.equal(account.config.apiKey, "oc_xxx");
});

await run("inbound uses gateway.call with resolved sessionKey", async () => {
  const calls = [];
  const runtime = {
    config: {
      loadConfig: () => ({
        channels: {
          clawfree: {
            apiKey: "oc_xxx",
            serverUrl: "https://example.com",
            sessionKey: "agent:test:session",
          },
        },
      }),
    },
    gateway: {
      call: async (method, payload) => {
        calls.push({ method, payload });
        return { messageId: "mid-1" };
      },
    },
  };

  const result = await inbound.receiveMessage({
    accountId: "default",
    message: {
      from: { id: "user-1" },
      content: "hello",
      id: "msg-1",
      timestamp: 123,
    },
    deps: { runtime },
  });

  assert.deepEqual(calls, [{
    method: "chat.send",
    payload: {
      sessionKey: "agent:test:session",
      message: "hello",
    },
  }]);
  assert.equal(result.messageId, "mid-1");
});

await run("outbound sendText posts to clawsend with api key header", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { messageId: "sent-1" };
      },
    };
  };

  try {
    const result = await outbound.sendText({
      to: "user-2",
      text: "reply",
      accountId: "default",
      cfg: {
        channels: {
          clawfree: {
            apiKey: "oc_send",
            serverUrl: "https://example.com",
          },
        },
      },
    });

    assert.equal(result.messageId, "sent-1");
    assert.equal(calls[0].url, "https://example.com/api/clawsend");
    assert.equal(calls[0].options.headers["X-API-Key"], "oc_send");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await run("gateway startAccount loads apiKey via token when needed", async () => {
  const originalAxiosGet = axios.get;
  const originalFetch = globalThis.fetch;
  let started = false;

  axios.get = async () => ({
    data: {
      success: true,
      serverUrl: "https://example.com",
      keys: [{ keyValue: "oc_loaded", keyType: "paid", isActive: true }],
    },
  });

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      started = true;
      return { messages: [], offset: 0 };
    },
  });

  try {
    const account = {
      accountId: "default",
      enabled: true,
      config: {
        token: "token-1",
        serverUrl: "https://example.com",
      },
    };

    const abortController = new AbortController();
    const runtimeState = await clawfreePlugin.gateway.startAccount({
      account,
      cfg: {
        channels: {
          clawfree: {
            token: "token-1",
            serverUrl: "https://example.com",
          },
        },
      },
      abortSignal: abortController.signal,
      deps: {
        runtime: {
          config: {
            loadConfig: () => ({
              channels: {
                clawfree: {
                  token: "token-1",
                  serverUrl: "https://example.com",
                },
              },
            }),
          },
        },
      },
      log: {},
    });

    assert.equal(account.config.apiKey, "oc_loaded");
    assert.equal(runtimeState.running, true);
    assert.equal(started, true);
    abortController.abort();
    clawfreePlugin.gateway.stopAccount({ account, log: {} });
  } finally {
    axios.get = originalAxiosGet;
    globalThis.fetch = originalFetch;
  }
});

console.log("All clawfree channel tests passed.");
