import { Plugin } from "@opencode/plugin";
import { anthropic } from "./providers/anthropic.ts";
import { copilot } from "./providers/copilot.ts";
import { openai } from "./providers/openai.ts";
import type { OAuthCredential, Provider } from "./providers/provider.ts";
import { initialState, type ProviderState, recordFailure, recordSuccess } from "./refresh.ts";
import { UsageRpc } from "./rpc.ts";
import { isSnapshot, PLUGIN_ID, type Snapshot } from "./shared.ts";

const GLOBAL_STATE_KEY = Symbol.for(PLUGIN_ID);
const SNAPSHOT_STORAGE_KEY = "snapshot";

const SUPPORTED_PROVIDERS: readonly Provider[] = [anthropic, copilot, openai];

const REFRESH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5000;

// OpenCode loads a server plugin once per project location. The state lives on globalThis so all copies (and hot reloads)
// share one fetch schedule.
interface GlobalState {
  providers: Map<string, ProviderState>;
  refreshing?: Promise<boolean>;
}

function globalState(): GlobalState {
  const global = globalThis as { [GLOBAL_STATE_KEY]?: GlobalState };
  global[GLOBAL_STATE_KEY] ??= { providers: new Map() };
  return global[GLOBAL_STATE_KEY];
}

function buildSnapshot(): Snapshot {
  const { providers } = globalState();
  return {
    providers: SUPPORTED_PROVIDERS.toSorted((a, b) => a.name.localeCompare(b.name)).flatMap((provider) => {
      const state = providers.get(provider.id);
      if (!state || (state.usage.windows.length === 0 && !state.usage.error)) {
        return [];
      }
      return [{ ...state.usage, name: provider.name }];
    }),
  };
}

async function findOAuthCredential(ctx: Plugin.Context, provider: Provider): Promise<OAuthCredential | undefined> {
  for (const integrationID of provider.integrations) {
    const connection = await ctx.integration.connection.active(integrationID).catch(() => undefined);
    if (connection?.type !== "credential") {
      continue;
    }

    const value = await ctx.integration.connection.resolve(connection).catch(() => undefined);
    if (value?.type === "oauth") {
      return value;
    }
  }
  return undefined;
}

async function refreshProvider(ctx: Plugin.Context, provider: Provider, now: number): Promise<boolean> {
  const { providers } = globalState();
  const state = providers.get(provider.id) ?? initialState(provider.id, provider.name);
  if (state.retryAt > now) {
    return false;
  }

  const login = await findOAuthCredential(ctx, provider);
  if (!login) {
    return providers.delete(provider.id);
  }

  try {
    const windows = await provider.fetch(login, AbortSignal.timeout(FETCH_TIMEOUT_MS), now);
    providers.set(provider.id, recordSuccess(state, windows, now));
  } catch (error) {
    providers.set(provider.id, recordFailure(state, error, now));
  }

  return true;
}

function refreshDueProviders(ctx: Plugin.Context): Promise<boolean> {
  const state = globalState();

  state.refreshing ??= Promise.all(SUPPORTED_PROVIDERS.map((provider) => refreshProvider(ctx, provider, Date.now())))
    .then((changes) => changes.some(Boolean))
    .finally(() => {
      state.refreshing = undefined;
    });

  return state.refreshing;
}

async function restoreStoredSnapshot(ctx: Plugin.Context) {
  const { providers } = globalState();
  if (providers.size > 0) {
    return;
  }

  const stored = await ctx.storage.get(SNAPSHOT_STORAGE_KEY).catch(() => undefined);
  if (!isSnapshot(stored)) {
    return;
  }

  for (const usage of stored.providers) {
    providers.set(usage.id, { usage, retryAt: 0, failures: 0 });
  }
}

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    await restoreStoredSnapshot(ctx);
    const registration = await ctx.rpc.register(UsageRpc, {
      snapshot: async () => buildSnapshot(),
    });

    const refreshAndPublish = async () => {
      if (!(await refreshDueProviders(ctx))) {
        return;
      }

      const snapshot = buildSnapshot();
      await ctx.storage.set(SNAPSHOT_STORAGE_KEY, snapshot).catch(() => undefined);

      await registration.events.emit("updated", snapshot).catch(() => undefined);
    };
    void refreshAndPublish();
    const timer = setInterval(() => void refreshAndPublish(), REFRESH_INTERVAL_MS);

    return async () => {
      clearInterval(timer);
      await registration.dispose();
    };
  },
});
