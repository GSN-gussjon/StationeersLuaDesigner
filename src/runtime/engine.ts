// Lua runtime built on Wasmoon. Loads a chip script, injects the `ic` API,
// IC10-style globals, and print(), then drives the `tick(dt)` loop.
//
// StationeersLua targets Lua 5.2; Wasmoon is Lua 5.4. For typical chip scripts
// (tables, functions, loops, string ops) the difference is immaterial. This is
// a Lua host with a mocked device API, not a cycle-accurate IC10 emulator.

// wasmoon is CommonJS; import the namespace and read LuaFactory at runtime so
// this works regardless of how the CJS→ESM interop exposes named exports.
import * as wasmoon from "wasmoon";
import type { LuaEngine } from "wasmoon";
import { buildIcApi, type IcHostBindings } from "./icMock";
import { buildSsApi, type SsHostBindings } from "./ssMock";
import type { SsEventKind } from "./ssScene";

type WasmoonModule = { LuaFactory: typeof import("wasmoon").LuaFactory };
const wm = wasmoon as unknown as WasmoonModule & { default?: WasmoonModule };
const LuaFactory = wm.LuaFactory ?? wm.default?.LuaFactory;

export interface RunHandle {
  stop: () => void;
  /**
   * Dispatch a UI event from the canvas preview into the running script.
   * No-op after the script has stopped.
   */
  dispatchUiEvent: (elementId: string, kind: SsEventKind, value?: string) => void;
}

export interface EngineCallbacks extends IcHostBindings, SsHostBindings {
  /** Called after each tick so the host can flush state to the UI. */
  onTick?: () => void;
}

const TICK_MS = 500; // StationeersLua ticks roughly every 0.5s.

/**
 * Load and run a chip script. Returns a handle to stop the tick loop.
 * Throws synchronously only for setup failures; script/runtime errors are
 * routed to bindings.log.
 */
export async function runScript(
  source: string,
  cb: EngineCallbacks
): Promise<RunHandle> {
  const factory = new LuaFactory();
  const lua: LuaEngine = await factory.createEngine();

  const { ic, globals } = buildIcApi(cb);
  const { ss, dispatchEvent } = buildSsApi(cb);

  // Inject print() -> console sink.
  lua.global.set("print", (...args: unknown[]) => {
    cb.log("log", args.map(stringifyLua).join("\t"));
  });

  // Inject the ic table and IC10-style globals (null-safed for Wasmoon).
  lua.global.set("ic", nullSafe(ic));
  for (const [name, fn] of Object.entries(globals)) {
    lua.global.set(name, nullSafe(fn));
  }

  // Inject the ScriptedScreens ss table.
  lua.global.set("ss", nullSafe(ss));

  // yield()/sleep() are no-ops in the simulator's cooperative model: the tick
  // loop already re-invokes the script's tick(). Scripts using while/yield
  // patterns should prefer tick() in the simulator.
  lua.global.set("yield", () => {});
  lua.global.set("sleep", () => {});

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Guarded event dispatch: safe to call any time; no-op once stopped.
  const dispatchUiEvent = (
    elementId: string,
    kind: SsEventKind,
    value?: string
  ) => {
    if (stopped) return;
    dispatchEvent(elementId, kind, value);
    // A UI event may change state the script renders; flush after handling.
    cb.onTick?.();
  };

  try {
    // Run module-level code once (this may define tick()).
    await lua.doString(source);
  } catch (e) {
    cb.log("error", `Script error: ${errText(e)}`);
    stopped = true;
    lua.global.close();
    return { stop: () => {}, dispatchUiEvent: () => {} };
  }

  const tickFn = lua.global.get("tick");
  const hasTick = typeof tickFn === "function";

  if (!hasTick) {
    // No tick loop, but the script may have built UI and registered event
    // callbacks (a valid ScriptedScreens pattern). Keep the Lua state alive so
    // clicks/changes from the preview still reach the handlers.
    cb.log(
      "info",
      "No tick(dt) — UI built once; event handlers stay live. Press Stop to end."
    );
    cb.onTick?.();
    const stopHandleNoTick = () => {
      if (stopped) return;
      stopped = true;
      lua.global.close();
    };
    return { stop: stopHandleNoTick, dispatchUiEvent };
  }

  cb.log("info", "Running tick(dt) loop…");

  const runOneTick = async () => {
    if (stopped) return;
    try {
      const fn = lua.global.get("tick");
      if (typeof fn === "function") {
        await fn(TICK_MS / 1000);
      }
      cb.onTick?.();
    } catch (e) {
      cb.log("error", `tick() error: ${errText(e)}`);
      stopHandle();
    }
  };

  const stopHandle = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    lua.global.close();
  };

  // Kick off immediately, then on the interval.
  void runOneTick();
  timer = setInterval(() => void runOneTick(), TICK_MS);

  return { stop: stopHandle, dispatchUiEvent };
}

/**
 * Wasmoon 1.16 crashes with "Cannot read properties of null (reading 'then')"
 * when an injected JS function returns `null` (it probes the result for a
 * thenable). Lua expects `nil`, which maps from `undefined`, not `null`.
 *
 * This deep-wraps injected tables and functions so any `null` a mock returns
 * becomes `undefined`. It also wraps functions/tables *returned* by wrapped
 * functions, so dynamically-created handles (e.g. ui:element -> handle,
 * ss.ui.surface -> surface, ui:get -> element) are covered too.
 */
function nullSafe<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null) return undefined as unknown as T;
  if (typeof value === "function") {
    const fn = value as unknown as (...a: unknown[]) => unknown;
    const wrapped = (...args: unknown[]) => nullSafe(fn(...args), seen);
    return wrapped as unknown as T;
  }
  if (value && typeof value === "object") {
    // Only wrap plain objects (our mock tables); leave arrays and class
    // instances (e.g. typed arrays, Maps) untouched to avoid breaking them.
    const proto = Object.getPrototypeOf(value);
    const isPlain = proto === Object.prototype || proto === null;
    if (!isPlain || seen.has(value as object)) return value;
    // Leave Proxy-like tables (e.g. ss.sounds, ss.ui.icons.*) intact: they have
    // a get-trap but no own enumerable keys, so copying would strip behavior.
    if (Object.keys(value as object).length === 0) return value;
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = nullSafe(v, seen);
    }
    return out as unknown as T;
  }
  return value;
}

function stringifyLua(v: unknown): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
