import test from "node:test";
import assert from "node:assert/strict";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { DOTS_CHANGED, rpc } from "./contract.ts";
import { hideDot } from "./display.ts";
import plugin from "./server.ts";

test("quiet completions, replies, intervening reads, interrupts and mode changes", async (t) => {
  const threadId = "thr_test";
  const thread = (at: number) =>
    makeThreadResponse({ id: threadId, latestAttentionAt: at });
  let endStatus = "completed";
  let endAt = 1;
  let host = createFakePluginHost({
    pluginId: "quiet-thread-dots",
    sdk: {
      threads: {
        get: async () => thread(10),
        events: {
          list: async () => [
            {
              type: "turn/completed",
              scope: { kind: "turn" },
              data: { status: endStatus },
              createdAt: endAt,
            },
          ],
        },
      },
    },
  });
  t.after(() => host.harness.lifecycle.dispose());
  plugin(host.bb);
  const configure = (mode: string) =>
    host.harness.behavior.callRpc("set", { threadId, mode });
  async function idle(at: number, text: string | null) {
    endAt = at;
    const result = await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(at),
      lastAssistantText: text,
    });
    assert.deepEqual(result.errors, []);
  }
  async function hidden(
    at: number,
    read: number,
    indicator = "unread-success",
  ) {
    const prefs = rpc.list.output.parse(
      await host.harness.behavior.callRpc("list", null),
    );
    return hideDot(
      { id: threadId, indicator, latestAttentionAt: at, lastReadAt: read },
      prefs[0],
    );
  }

  await idle(15, null);
  assert.equal(await hidden(15, 10), false);
  assert.equal(
    host.harness.inspection.sdk.callsTo("threads.events.list").length,
    0,
  );
  await configure("replies");
  const beforeSilent = host.harness.inspection.realtimeSignals.length;
  await idle(20, null);
  assert.deepEqual(
    host.harness.inspection.realtimeSignals.slice(beforeSilent),
    [{ channel: DOTS_CHANGED, payload: null }],
  );
  assert.equal(await hidden(20, 10), true);
  assert.equal(await hidden(20, 9), false); // existing unread at opt-in
  assert.equal(await hidden(21, 20), false); // unclassified attention
  const beforeReply = host.harness.inspection.realtimeSignals.length;
  await idle(30, "Build failed");
  assert.deepEqual(host.harness.inspection.realtimeSignals.slice(beforeReply), [
    { channel: DOTS_CHANGED, payload: null },
  ]);
  assert.equal(await hidden(30, 10), false);
  await idle(40, "");
  assert.equal(await hidden(40, 10), false); // unread earlier reply
  assert.equal(await hidden(40, 30), true);
  host = await host.harness.lifecycle.reload(plugin);
  assert.equal(await hidden(40, 30), true);
  endStatus = "interrupted";
  await idle(50, null);
  assert.equal(await hidden(50, 40), false);
  endStatus = "completed";
  await host.harness.behavior.emitThreadEvent("thread.failed", {
    thread: thread(60),
    error: "offline",
  });
  await idle(70, null);
  assert.equal(await hidden(70, 50), false);
  await configure("hidden");
  assert.equal(await hidden(70, 50), true);
  for (const indicator of [
    "unread-error",
    "runtime",
    "waiting-for-input",
    "none",
  ]) {
    assert.equal(await hidden(70, 50, indicator), false);
  }
  await configure("all");
  assert.deepEqual(await host.harness.behavior.callRpc("list", null), []);
});

test("classify a pre-existing dot only for a single verified silent unread turn", async (t) => {
  const thread = makeThreadResponse({
    latestAttentionAt: 100,
    lastReadAt: 80,
    status: "idle",
  });
  let output: string | null = null;
  let previousAt = 60;
  const scope = { kind: "turn", turnId: "turn1" };
  const { bb, harness } = createFakePluginHost({
    pluginId: "quiet-thread-dots",
    sdk: {
      threads: {
        get: async () => thread,
        output: async () => ({ output }),
        events: {
          list: async () => [
            {
              type: "turn/completed",
              scope,
              createdAt: 99,
              data: { status: "completed" },
            },
            { type: "turn/started", scope, createdAt: 85 },
            { type: "turn/completed", createdAt: previousAt },
          ],
        },
      },
    },
  });
  t.after(() => harness.lifecycle.dispose());
  plugin(bb);
  const set = (mode: string) =>
    harness.behavior.callRpc("set", { threadId: thread.id, mode });
  async function hidesExisting() {
    await set("all");
    await set("replies");
    const [state] = rpc.list.output.parse(
      await harness.behavior.callRpc("list", null),
    );
    return hideDot({ ...thread, indicator: "unread-success" }, state);
  }
  assert.equal(await hidesExisting(), true);
  output = "Tests failed";
  assert.equal(await hidesExisting(), false);
  output = null;
  previousAt = 81;
  assert.equal(await hidesExisting(), false);
});
