import type {
  BbPluginApi,
  PluginThreadEventPayloads,
} from "@get-bb/plugin-sdk";
import { DOTS_CHANGED, rpc, type DotPreference } from "./contract.ts";

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE dots (
      threadId TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('replies','hidden')),
      quietAt INTEGER,
      keepAt INTEGER NOT NULL
    )`,
  ]);
  const get = db.prepare<[string], DotPreference>(
    "SELECT * FROM dots WHERE threadId = ?",
  );
  const list = db.prepare<[], DotPreference>(
    "SELECT * FROM dots ORDER BY threadId",
  );
  const remove = db.prepare("DELETE FROM dots WHERE threadId = ?");
  const set = db.prepare(`
    INSERT INTO dots (threadId, mode, keepAt) VALUES (?, ?, ?)
    ON CONFLICT(threadId) DO UPDATE SET mode = excluded.mode, quietAt = NULL,
      keepAt = excluded.keepAt WHERE dots.mode != excluded.mode
  `);
  const keep = db.prepare(`UPDATE dots SET keepAt = ? WHERE threadId = ?
    AND mode = 'replies' AND keepAt < ?`);
  const quiet = db.prepare(`UPDATE dots SET quietAt = ? WHERE threadId = ?
    AND mode = 'replies' AND (quietAt IS NULL OR quietAt < ?)`);
  const seedQuiet = db.prepare(`UPDATE dots SET quietAt = ?, keepAt = ?
    WHERE threadId = ? AND mode = 'replies' AND quietAt IS NULL AND keepAt = ?`);

  function recentTurns(threadId: string, limit: number) {
    return bb.sdk.threads.events.list({
      threadId,
      types: ["turn/started", "turn/completed"],
      order: "desc",
      limit: String(limit),
    });
  }

  function refresh() {
    bb.rpc.experimental_invalidate(["dots"]);
    // bb defers tagged RPC invalidations while a window is hidden. Its
    // desktop sidebar continues updating because it drives the Dock badge.
    bb.realtime.publish(DOTS_CHANGED, null);
  }

  async function classifyExistingDot(
    thread: PluginThreadEventPayloads["thread.idle"]["thread"],
  ) {
    const at = thread.latestAttentionAt;
    const readAt = thread.lastReadAt ?? 0;
    const [end, start, previous] = await recentTurns(thread.id, 3);
    // Only reclassify an existing dot if one confirmed turn accounts for
    // the unread interval. Older unread replies must stay visible.
    if (
      end?.type !== "turn/completed" ||
      end.data.status !== "completed" ||
      end.scope.kind !== "turn" ||
      end.createdAt < readAt ||
      end.createdAt > at ||
      start?.type !== "turn/started" ||
      start.scope.kind !== "turn" ||
      start.scope.turnId !== end.scope.turnId ||
      (previous && previous.createdAt > readAt)
    )
      return;
    const { output } = await bb.sdk.threads.output({ threadId: thread.id });
    if (output?.trim()) return;
    const current = await bb.sdk.threads.get({ threadId: thread.id });
    if (
      current.status === "idle" &&
      current.latestAttentionAt === at &&
      current.lastReadAt === thread.lastReadAt
    ) {
      seedQuiet.run(at, readAt, thread.id, at);
    }
  }

  bb.rpc.register(
    rpc,
    {
      list: () => list.all(),
      async set(input) {
        const thread = await bb.sdk.threads.get({ threadId: input.threadId });
        if (input.mode === "all") {
          remove.run(thread.id);
        } else {
          const at = thread.latestAttentionAt;
          const readAt = thread.lastReadAt ?? 0;
          const changed = set.run(thread.id, input.mode, at).changes;
          if (
            changed &&
            input.mode === "replies" &&
            thread.status === "idle" &&
            at > readAt
          ) {
            try {
              await classifyExistingDot(thread);
            } catch {
              bb.log.warn(
                "Could not verify the existing unread turn. Keeping its dot visible.",
              );
            }
          }
        }
        refresh();
        return input;
      },
    },
    { experimental_discoverable: true },
  );

  bb.events.on("thread.active", ({ thread }) => {
    const state = get.get(thread.id);
    if (
      state?.mode === "replies" &&
      state.quietAt !== thread.latestAttentionAt
    ) {
      // Preserve a result that arrived while the plugin was offline.
      if (
        keep.run(thread.latestAttentionAt, thread.id, thread.latestAttentionAt)
          .changes
      )
        refresh();
    }
  });

  bb.events.on("thread.failed", ({ thread }) => {
    if (
      keep.run(thread.latestAttentionAt, thread.id, thread.latestAttentionAt)
        .changes
    )
      refresh();
  });

  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    if (get.get(thread.id)?.mode !== "replies") return;
    const at = thread.latestAttentionAt;
    let silent = false;
    if (!lastAssistantText?.trim()) {
      // Stopping a turn can also move a thread to idle with empty output.
      const [end] = await recentTurns(thread.id, 1);
      silent =
        end?.type === "turn/completed" &&
        end.data.status === "completed" &&
        end.scope.kind === "turn" &&
        end.createdAt <= at;
    }
    const update = silent ? quiet : keep;
    if (update.run(at, thread.id, at).changes) refresh();
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    if (remove.run(thread.id).changes) refresh();
  });
}
