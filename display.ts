import type { DotPreference } from "./contract.ts";

type Row = {
  id: string;
  indicator: string;
  lastReadAt: number | null;
  latestAttentionAt: number;
};

export function hideDot(thread: Row, pref: DotPreference | undefined): boolean {
  if (!pref || thread.indicator !== "unread-success") return false;
  if (pref.mode === "hidden") return true;
  return (
    pref.mode === "replies" &&
    pref.quietAt === thread.latestAttentionAt &&
    pref.keepAt <= (thread.lastReadAt ?? 0) &&
    pref.keepAt < thread.latestAttentionAt
  );
}

export function dotStyles(ids: string[]): string {
  if (ids.length === 0) return "";
  // The row link and trailing glyph are siblings in bb's built-in thread list.
  // A collapsed parent's glyph may represent another thread.
  const links = ids
    .map((id) => `a[data-sidebar-thread-id="${CSS.escape(id)}"]`)
    .join(",");
  return `[data-sidebar-rename-row]:has(> span > :is(${links})):not(:has(button[data-sidebar-rename-anchor][aria-expanded="false"])) > [data-sidebar-thread-trailing] [data-sidebar-thread-trailing-indicator] > span[aria-label="Unread thread succeeded"] { display: none !important; }`;
}
