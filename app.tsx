import { useEffect, useEffectEvent, useMemo } from "react";
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  experimental_useSidebarThreads,
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import { DOTS_CHANGED, modeSchema, rpc } from "./contract.ts";
import { dotStyles, hideDot } from "./display.ts";
import { windowDockReporter } from "./dock.ts";

const labels = {
  all: "All completions",
  replies: "With a final reply",
  hidden: "Hide dot",
};

function useDots() {
  const { data, refetch } = experimental_useRpcQuery({
    contract: rpc,
    method: "list",
    input: null,
  });
  const { mutate } = experimental_useRpcMutation({
    contract: rpc,
    method: "set",
  });
  const { threads, status } = experimental_useSidebarThreads();
  const prefs = useMemo(
    () => new Map(data?.map((pref) => [pref.threadId, pref])),
    [data],
  );
  const quietIds = useMemo(
    () =>
      new Set(
        threads.filter((t) => hideDot(t, prefs.get(t.id))).map((t) => t.id),
      ),
    [threads, prefs],
  );
  const css = dotStyles([...quietIds]);
  const dock = useMemo(windowDockReporter, []);
  const connection = useRealtimeConnectionState();
  const refreshHiddenDock = useEffectEvent(() => {
    if (dock && document.visibilityState === "hidden") void refetch();
  });
  useRealtime(DOTS_CHANGED, refreshHiddenDock);
  useEffect(() => {
    // Catch missed signals after a reconnect or a plugin reload in the background.
    if (connection === "connected") refreshHiddenDock();
  }, [connection]);
  useEffect(() => {
    if (!dock) return;
    // bb cancels in-flight query reads when hiding the window. Start a fresh
    // one if a foreground invalidation coincided with that transition.
    document.addEventListener("visibilitychange", refreshHiddenDock);
    return () =>
      document.removeEventListener("visibilitychange", refreshHiddenDock);
  }, [dock]);
  useEffect(() => {
    if (status === "ready") dock?.update(threads, quietIds);
  }, [dock, threads, quietIds, status]);
  useEffect(() => () => dock?.dispose(), [dock]);
  useEffect(() => {
    if (!css) return;
    const style = document.createElement("style");
    style.dataset.quietThreadDots = "";
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  }, [css]);
  const ready = data !== undefined;
  return useMemo(() => ({ prefs, mutate, ready }), [prefs, mutate, ready]);
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "unread-dot",
    title: "Unread dot",
    icon: "Circle",
    group: experimental_THREAD_ACTION_GROUPS.state,
    useData: useDots,
    item: ({ thread, data }) => {
      if (!data.ready || thread.archivedAt !== null) return null;
      const mode = data.prefs.get(thread.id)?.mode ?? "all";
      return {
        label: "Unread dot",
        icon: "Circle",
        detail: labels[mode],
        choices: {
          items: modeSchema.options.map((id) => ({
            id,
            label: labels[id],
            selected: id === mode,
          })),
        },
        run: async ({ value }) => {
          await data.mutate({
            threadId: thread.id,
            mode: modeSchema.parse(value),
          });
        },
      };
    },
  });
});
