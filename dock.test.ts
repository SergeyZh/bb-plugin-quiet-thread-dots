import test from "node:test";
import assert from "node:assert/strict";
import { createDockReporter, type AttentionReport } from "./dock.ts";

const unread = (id: string) => ({
  id,
  isUnread: true,
  isHidden: false,
  hasPendingInteraction: false,
});
const build = unread("build");
const other = unread("other");
const prompt = { ...unread("approval"), hasPendingInteraction: true };
const quiet = new Set(["build"]);
const all = new Set<string>();
const tick = () => Promise.resolve();

test("macOS drops a quiet completion while retaining other unread and pending threads", async () => {
  const reports: AttentionReport[] = [];
  const dock = createDockReporter({
    platform: "macos",
    setAttentionThreads: (v) => reports.push(v),
  })!;
  dock.update([build], quiet);
  await tick();
  assert.deepEqual(reports.at(-1), {
    pendingThreadIds: [],
    unreadThreadIds: [],
  });
  dock.update(
    [build, other, prompt, { ...unread("internal"), isHidden: true }],
    quiet,
  );
  await tick();
  assert.deepEqual(reports.at(-1), {
    pendingThreadIds: ["approval"],
    unreadThreadIds: ["other"],
  });
  dock.update([{ ...build, hasPendingInteraction: true }, other], quiet);
  await tick();
  assert.deepEqual(reports.at(-1), {
    pendingThreadIds: ["build"],
    unreadThreadIds: ["other"],
  });
  dock.dispose();
});

test("return to bb's report when a reply arrives, filtering stops or the plugin unloads", async () => {
  const reports: AttentionReport[] = [];
  const dock = createDockReporter({
    platform: "macos",
    setAttentionThreads: (v) => reports.push(v),
  })!;
  dock.update([build, other], quiet);
  await tick();
  dock.update([build], all);
  await tick();
  assert.deepEqual(reports.at(-1), {
    pendingThreadIds: [],
    unreadThreadIds: ["build"],
  });
  dock.update([build], quiet);
  await tick();
  dock.update([build, other], quiet);
  dock.dispose();
  await tick();
  assert.deepEqual(reports.at(-1), {
    pendingThreadIds: [],
    unreadThreadIds: ["build", "other"],
  });
});

test("a superseded or unmounted render cannot publish a stale report", async () => {
  const reports: AttentionReport[] = [];
  const dock = createDockReporter({
    platform: "macos",
    setAttentionThreads: (v) => reports.push(v),
  })!;
  dock.update([build], quiet);
  dock.update([build, other], quiet);
  await tick();
  assert.deepEqual(reports, [
    { pendingThreadIds: [], unreadThreadIds: ["other"] },
  ]);
  dock.dispose();
  const n = reports.length;
  dock.update([build], quiet);
  dock.dispose();
  await tick();
  assert.equal(reports.length, n);
  assert.equal(createDockReporter(undefined), null);
  assert.equal(createDockReporter({ platform: "macos" }), null);
});
