import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

type DockThread = Pick<
  PluginSidebarThread,
  "id" | "isHidden" | "isUnread" | "hasPendingInteraction"
>;

export type AttentionReport = {
  pendingThreadIds: string[];
  unreadThreadIds: string[];
};

interface DesktopBridge {
  platform?: string;
  setAttentionThreads?(report: AttentionReport): void;
}

// bb Desktop combines one report per window. It shows a number for pending
// input and a dot for other unread threads. Apply the sidebar's filter only
// to the unread list sent by this window.
export function createDockReporter(bridge: DesktopBridge | undefined) {
  if (bridge?.platform !== "macos" || !bridge.setAttentionThreads) return null;
  const send = bridge.setAttentionThreads.bind(bridge);
  let generation = 0;
  let restore: AttentionReport | null = null;
  return {
    update(threads: readonly DockThread[], quietIds: ReadonlySet<string>) {
      const current = ++generation;
      if (!quietIds.size && !restore) return;
      const pendingThreadIds: string[] = [];
      const unreadThreadIds: string[] = [];
      for (const thread of threads) {
        if (thread.isHidden) continue;
        if (thread.hasPendingInteraction) pendingThreadIds.push(thread.id);
        else if (thread.isUnread) unreadThreadIds.push(thread.id);
      }
      const native = { pendingThreadIds, unreadThreadIds };
      const filtered = unreadThreadIds.filter((id) => !quietIds.has(id));
      const suppress = filtered.length !== unreadThreadIds.length;
      if (!suppress && !restore) return;
      if (restore) restore = native;

      // AppLayout publishes its native report in a React effect on the same
      // sidebar snapshot. Publish after commit, including in background windows.
      queueMicrotask(() => {
        if (current !== generation) return;
        send({ pendingThreadIds, unreadThreadIds: filtered });
        restore = suppress ? native : null;
      });
    },
    dispose() {
      ++generation;
      if (restore) send(restore);
      restore = null;
    },
  };
}

export function windowDockReporter() {
  const desktop = (window as Window & { bbDesktop?: DesktopBridge }).bbDesktop;
  return createDockReporter(desktop);
}
