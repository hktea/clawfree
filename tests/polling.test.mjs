import assert from "node:assert/strict";

import { __test } from "../dist/src/polling.js";

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

await run("resolveQueueRouting prefers explicit sessionId from polling message", () => {
  const routing = __test.resolveQueueRouting({
    from: "custom_302d1aab",
    sessionId: "custom_302d1aab",
    content: "hello",
  }, "agent:main:main");

  assert.equal(routing.sessionId, "custom_302d1aab");
  assert.equal(routing.replyTarget, "custom_302d1aab");
});

await run("resolveQueueRouting falls back to configured sessionKey for non-session senders", () => {
  const routing = __test.resolveQueueRouting({
    from: "wechat_user",
    content: "hello",
  }, "agent:main:main");

  assert.equal(routing.sessionId, "agent:main:main");
  assert.equal(routing.replyTarget, "wechat_user");
});

console.log("All clawfree polling tests passed.");
