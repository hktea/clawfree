import assert from "node:assert/strict";

import {
  getPluginConfig,
  isConfigValid,
  listAccountIds,
  resolveAccountConfig,
  validatePluginConfig,
} from "../dist/src/config.js";

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("returns defaults when channels.clawfree is missing", () => {
  const config = resolveAccountConfig({});

  assert.equal(config.enabled, true);
  assert.equal(config.serverUrl, "https://wx.clawwx.top");
  assert.equal(config.pollIntervalMs, 5000);
  assert.equal(config.sessionKey, "agent:main:main");
  assert.equal(config.mode, "public");
});

run("resolves top-level channel config from channels.clawfree", () => {
  const cfg = {
    channels: {
      clawfree: {
        enabled: false,
        apiKey: "oc_top_level",
        serverUrl: "https://example.com",
        mode: "local",
      },
    },
  };

  const config = getPluginConfig(cfg);

  assert.equal(config.apiKey, "oc_top_level");
  assert.equal(config.serverUrl, "https://example.com");
  assert.equal(config.mode, "local");
  assert.equal(config.sessionKey, "agent:main:main");
});

run("resolves account config and auto-generates per-account session keys", () => {
  const cfg = {
    channels: {
      clawfree: {
        enabled: true,
        defaults: {
          serverUrl: "https://example.com",
          pollIntervalMs: 8000,
          debug: true,
        },
        accounts: {
          sales: {
            apiKey: "oc_sales_12345678",
          },
          support: {
            apiKey: "oc_support_87654321",
            sessionKey: "agent:custom:support",
          },
        },
      },
    },
  };

  const sales = resolveAccountConfig(cfg, "sales");
  const support = resolveAccountConfig(cfg, "support");

  assert.equal(sales.enabled, true);
  assert.equal(sales.serverUrl, "https://example.com");
  assert.equal(sales.pollIntervalMs, 8000);
  assert.equal(sales.debug, true);
  assert.equal(sales.sessionKey, "agent:clawfree:sales:12345678");

  assert.equal(support.sessionKey, "agent:custom:support");
});

run("lists account ids from channels.clawfree.accounts only", () => {
  const cfg = {
    channels: {
      clawfree: {
        accounts: {
          sales: { apiKey: "oc_sales" },
          support: { apiKey: "oc_support" },
        },
      },
    },
    plugins: {
      entries: {
        clawfree: {
          accounts: {
            legacy: { apiKey: "oc_legacy" },
          },
        },
      },
    },
  };

  assert.deepEqual(listAccountIds(cfg), ["sales", "support"]);
});

run("validates missing config under new path", () => {
  const result = validatePluginConfig({});

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["Channel config not found at channels.clawfree"]);
});

run("accepts token-only config on channels.clawfree", () => {
  const result = validatePluginConfig({
    channels: {
      clawfree: {
        token: "login-token",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

run("rejects incomplete direct config without token fallback", () => {
  const result = validatePluginConfig({
    channels: {
      clawfree: {
        apiKey: "oc_xxx",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

run("checks config validity with apiKey only", () => {
  assert.equal(isConfigValid({ apiKey: "oc_xxx", serverUrl: "https://example.com" }), true);
  assert.equal(isConfigValid({ apiKey: "oc_xxx" }), true);
  assert.equal(isConfigValid({ serverUrl: "https://example.com" }), false);
});

console.log("All clawfree config tests passed.");
