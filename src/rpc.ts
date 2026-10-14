import { Rpc } from "@opencode/plugin/rpc";
import { PLUGIN_ID } from "./shared.ts";

const EMPTY = { type: "object", additionalProperties: false } as const;

export const UsageRpc = Rpc.define({
  id: PLUGIN_ID,
  methods: {
    snapshot: {
      input: EMPTY,
      output: { type: "object" },
    },
  },
  events: {
    updated: { schema: { type: "object" } },
  },
});
