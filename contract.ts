import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const modeSchema = z.enum(["all", "replies", "hidden"]);
const threadId = z.string().min(1).max(200);
export const preference = z.object({ threadId, mode: modeSchema });
const row = preference.extend({
  quietAt: z.number().nullable(),
  keepAt: z.number(),
});
export type DotPreference = z.infer<typeof row>;
export const DOTS_CHANGED = "dots-changed";
export const rpc = defineRpcContract({
  list: {
    experimental_description:
      "List threads with a custom sidebar dot preference.",
    input: z.null(),
    output: z.array(row),
    tags: () => ["dots"],
  },
  set: {
    experimental_description:
      "Set one thread's sidebar dot mode to all, replies, or hidden.",
    input: preference,
    output: preference,
  },
});
