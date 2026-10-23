import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, type AppNavigationState } from "@fungi.computer/agar";
import {
  createWindowManager,
  prepareWithDeliveryRetry,
  APP_SURFACE_DOCUMENT_TIMEOUT_MS,
  type WindowHost,
  type WindowEvents,
} from "../src/window-manager.js";

type Launch = Readonly<{ windowId: string; title: string }>;
type Container = Readonly<{ paneId: string }>;

const launch = (windowId: string): Launch => ({ windowId, title: windowId });
function host(dispose: () => void): WindowHost<Launch> {
  return {
    dispose,
    reconfigure: () => undefined,
    setVisibility: () => undefined,
  };
}

describe("shell preparation delivery budget", () => {
  afterEach(() => vi.useRealTimers());

  it("backs off pending preparation and releases the deadline before document mounting", async () => {
    vi.useFakeTimers();
    const pending = new AppError("delivery pending", {
      code: "DELIVERY_PENDING",
      retryable: true,
    });
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(pending)
      .mockResolvedValue("prepared");
    const onPending = vi.fn();
    const result = prepareWithDeliveryRetry(
      prepare,
      new AbortController().signal,
      onPending,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(onPending).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(prepare).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("prepared");
    await vi.advanceTimersByTimeAsync(APP_SURFACE_DOCUMENT_TIMEOUT_MS);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never restarts the total budget and retains the last actual pending error", async () => {
    vi.useFakeTimers();
    let lastPending: AppError | undefined;
    const prepare = vi.fn(() => {
      lastPending = new AppError("actual pending delivery", {
        code: "DELIVERY_PENDING",
        retryable: true,
      });
      return Promise.reject(lastPending);
    });
    const result = prepareWithDeliveryRetry(
      prepare,
      new AbortController().signal,
      () => undefined,
    ).catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(APP_SURFACE_DOCUMENT_TIMEOUT_MS - 1);
    const attempts = prepare.mock.calls.length;
    expect(attempts).toBeGreaterThan(3);
    expect(attempts).toBeLessThan(20);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(lastPending);
    await vi.advanceTimersByTimeAsync(APP_SURFACE_DOCUMENT_TIMEOUT_MS);
    expect(prepare).toHaveBeenCalledTimes(attempts);
  });

  it.each(["deadline", "close"] as const)(
    "aborts in-flight preparation on %s without another attempt",
    async (ending) => {
      vi.useFakeTimers();
      const pending = new AppError("actual pending", {
        code: "DELIVERY_PENDING",
        retryable: true,
      });
      const controller = new AbortController();
      let inFlight: AbortSignal | undefined;
      const prepare = vi.fn((signal: AbortSignal) => {
        if (prepare.mock.calls.length === 1) return Promise.reject(pending);
        inFlight = signal;
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(
                new Error("Preparation aborted", { cause: signal.reason }),
              );
            },
            { once: true },
          );
        });
      });
      const result = prepareWithDeliveryRetry(
        prepare,
        controller.signal,
        () => undefined,
      ).catch((cause: unknown) => cause);
      await vi.advanceTimersByTimeAsync(250);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(inFlight?.aborted).toBe(false);
      const closed = new DOMException("closed", "AbortError");
      if (ending === "close") controller.abort(closed);
      else
        await vi.advanceTimersByTimeAsync(
          APP_SURFACE_DOCUMENT_TIMEOUT_MS - 250,
        );
      expect(await result).toBe(ending === "close" ? closed : pending);
      expect(inFlight?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(APP_SURFACE_DOCUMENT_TIMEOUT_MS);
      expect(prepare).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    new AppError("denied", { code: "CAPABILITY_DENIED", retryable: false }),
    new AppError("unavailable", { code: "HOST_FAILURE", retryable: true }),
    new AppError("stale", { code: "SELECTION_CHANGED", retryable: true }),
    new AppError("not retryable", {
      code: "DELIVERY_PENDING",
      retryable: false,
    }),
    Object.assign(new Error("Untyped pending refusal"), {
      code: "DELIVERY_PENDING",
    }),
  ])(
    "does not retry a non-pending or non-retryable refusal: %j",
    async (refusal) => {
      const prepare = vi.fn(() => Promise.reject(refusal));
      const onPending = vi.fn();
      await expect(
        prepareWithDeliveryRetry(
          prepare,
          new AbortController().signal,
          onPending,
        ),
      ).rejects.toBe(refusal);
      expect(prepare).toHaveBeenCalledOnce();
      expect(onPending).not.toHaveBeenCalled();
    },
  );
});

describe("renderer-neutral window ownership", () => {
  it("presents pending preparation through minimize/restore and ignores a retired generation", async () => {
    const mounted = Promise.withResolvers<WindowHost<Launch>>();
    let events: WindowEvents | undefined;
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      mount: (_container, _launch, _signal, callbacks) => {
        events = callbacks;
        return mounted.promise;
      },
    });
    const opening = manager.open(launch("pending"));
    await Promise.resolve();
    events?.onDeliveryPending?.();
    expect(manager.read().windows[0]?.status).toBe("getting-ready");
    await manager.minimize("pending");
    expect(manager.read().windows[0]?.status).toBe("minimized");
    await manager.restore("pending");
    expect(manager.read().windows[0]?.status).toBe("getting-ready");
    const closing = manager.close("pending");
    events?.onDeliveryPending?.();
    mounted.resolve(host(() => undefined));
    await Promise.all([opening, closing]);
    expect(manager.read().windows).toEqual([]);
    await manager.dispose();
  });
  it("mounts native containers and retires each generation once", async () => {
    const disposed: string[] = [];
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      mount: (container) =>
        host(() => {
          disposed.push(container.paneId);
        }),
    });
    await manager.open(launch("alpha"));
    await manager.open(launch("beta"));
    expect(manager.read().windows.map((window) => window.container)).toEqual([
      { paneId: "alpha" },
      { paneId: "beta" },
    ]);
    await manager.close("alpha");
    expect(manager.read().windows.map((window) => window.windowId)).toEqual([
      "beta",
    ]);
    await manager.dispose();
    await manager.dispose();
    expect(disposed).toEqual(["alpha", "beta"]);
    expect(manager.read().windows).toEqual([]);
  });

  it("aborts close immediately and disposes a native mount arriving late", async () => {
    const pending = Promise.withResolvers<WindowHost<Launch>>();
    const aborted = Promise.withResolvers<undefined>();
    let mountSignal: AbortSignal | undefined;
    let disposed = 0;
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      mount: (_container, _launch, signal) => {
        mountSignal = signal;
        signal.addEventListener(
          "abort",
          () => {
            aborted.resolve(undefined);
          },
          { once: true },
        );
        return pending.promise;
      },
    });
    const opening = manager.open(launch("slow"));
    const closing = manager.close("slow");
    await aborted.promise;
    expect(mountSignal?.aborted).toBe(true);
    pending.resolve(
      host(() => {
        disposed += 1;
      }),
    );
    await Promise.all([opening, closing]);
    expect(disposed).toBe(1);
    expect(manager.read().windows).toEqual([]);
    await manager.dispose();
  });

  it("uses the renderer's attachment predicate instead of a DOM property", async () => {
    let mounted = 0;
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      waitForAttachment: true,
      isAttached: () => false,
      mount: () => {
        mounted += 1;
        return host(() => undefined);
      },
    });
    const opening = manager.open(launch("detached"));
    expect(mounted).toBe(0);
    manager.attach("detached");
    await opening;
    expect(mounted).toBe(1);
    await manager.dispose();
  });
});

it("reports a failed mutation with its phase and the original generation", async () => {
  const cause = new Error("fixture disposal failed");
  const failures: unknown[] = [];
  const manager = createWindowManager<Launch, Container>({
    createContainer: ({ windowId }) => ({ paneId: windowId }),
    mount: () =>
      host(() => {
        throw cause;
      }),
    onFailure: (failure) => {
      failures.push(failure);
    },
  });
  await manager.open(launch("failed-close"));
  await expect(manager.close("failed-close")).rejects.toBe(cause);
  expect(failures).toContainEqual({
    windowId: "failed-close",
    generation: 1,
    phase: "mutation",
    cause,
  });
  await expect(manager.dispose()).rejects.toMatchObject({ errors: [cause] });
});

describe("window navigation activations", () => {
  it("delivers only crumbs and enabled commands the App publishes now", async () => {
    const delivered: unknown[] = [];
    let publish: ((state: AppNavigationState | null) => void) | undefined;
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      mount: (_container, _launch, _signal, events) => {
        publish = events.onNavigationState;
        return {
          ...host(() => undefined),
          activateNavigation: (activation) => {
            delivered.push(activation);
            return true;
          },
        };
      },
    });
    await manager.open(launch("trellis"));
    publish?.({
      canGoBack: false,
      crumbs: [
        { id: "app", label: "Trellis" },
        { id: "wf", label: "Flow", siblings: [{ id: "b", label: "B" }] },
      ],
      primary: [{ id: "run", label: "Run" }],
      menu: [{ id: "fork", label: "Fork", disabled: true }],
    });
    const use = (
      activation: Parameters<typeof manager.activateNavigation>[1],
    ) => manager.activateNavigation("trellis", activation);
    await expect(use({ kind: "crumb", crumbId: "app" })).resolves.toBe(true);
    await expect(
      use({ kind: "crumb", crumbId: "wf", siblingId: "b" }),
    ).resolves.toBe(true);
    await expect(use({ kind: "action", actionId: "run" })).resolves.toBe(true);
    await expect(use({ kind: "action", actionId: "fork" })).resolves.toBe(
      false,
    );
    await expect(use({ kind: "crumb", crumbId: "gone" })).resolves.toBe(false);
    await expect(
      use({ kind: "crumb", crumbId: "wf", siblingId: "z" }),
    ).resolves.toBe(false);
    expect(delivered).toHaveLength(3);
    publish?.(null);
    await expect(use({ kind: "crumb", crumbId: "app" })).resolves.toBe(false);
    await manager.dispose();
  });
});

describe("window status actions", () => {
  it("delivers only enabled items and options the App declares now", async () => {
    const delivered: unknown[] = [];
    let report:
      ((items: Parameters<WindowEventsReport>[0]) => void) | undefined;
    const manager = createWindowManager<Launch, Container>({
      createContainer: ({ windowId }) => ({ paneId: windowId }),
      mount: (_container, _launch, _signal, events) => {
        report = events.onStatusItems;
        return {
          ...host(() => undefined),
          activateStatus: (action) => {
            delivered.push(action);
            return true;
          },
        };
      },
    });
    await manager.open(launch("shed"));
    report?.([
      { kind: "text", id: "state", text: "open" },
      { kind: "button", id: "ports", text: "Ports" },
      { kind: "button", id: "off", text: "Off", disabled: true },
      {
        kind: "menu",
        id: "folder",
        text: "media",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B", disabled: true },
        ],
      },
    ]);
    const use = (action: Parameters<typeof manager.activateStatus>[1]) =>
      manager.activateStatus("shed", action);
    await expect(use({ itemId: "ports" })).resolves.toBe(true);
    await expect(use({ itemId: "folder", optionId: "a" })).resolves.toBe(true);
    // A readout, a removed item, a disabled item or option, a bogus or
    // missing option, and an option on a button never reach the App.
    await expect(use({ itemId: "state" })).resolves.toBe(false);
    await expect(use({ itemId: "gone" })).resolves.toBe(false);
    await expect(use({ itemId: "off" })).resolves.toBe(false);
    await expect(use({ itemId: "folder", optionId: "b" })).resolves.toBe(false);
    await expect(use({ itemId: "folder", optionId: "z" })).resolves.toBe(false);
    await expect(use({ itemId: "folder" })).resolves.toBe(false);
    await expect(use({ itemId: "ports", optionId: "a" })).resolves.toBe(false);
    expect(delivered).toEqual([
      { itemId: "ports" },
      { itemId: "folder", optionId: "a" },
    ]);
    report?.([]);
    await expect(use({ itemId: "ports" })).resolves.toBe(false);
    await manager.dispose();
  });
});

type WindowEventsReport = Parameters<
  Parameters<typeof createWindowManager<Launch, Container>>[0]["mount"]
>[3]["onStatusItems"];

it("routes Computer choice only to the current window picker registration", async () => {
  const mountedEvents: WindowEvents[] = [];
  const opened: string[] = [];
  const manager = createWindowManager<Launch, Container>({
    createContainer: ({ windowId }) => ({ paneId: windowId }),
    mount: (_container, _launch, _signal, events) => {
      mountedEvents.push(events);
      return host(() => undefined);
    },
  });
  await manager.open(launch("alpha"));
  const first = mountedEvents[0];
  if (!first) throw new Error("Expected mounted window events");
  await expect(first.onComputerChoice()).rejects.toMatchObject({
    code: "CAPABILITY_DENIED",
  });
  const unregister = manager.registerComputerChoice("alpha", () => {
    opened.push("alpha");
  });
  await first.onComputerChoice();
  expect(opened).toEqual(["alpha"]);
  unregister();
  await expect(first.onComputerChoice()).rejects.toMatchObject({
    code: "CAPABILITY_DENIED",
  });
  await manager.close("alpha");
  await manager.open(launch("alpha"));
  manager.registerComputerChoice("alpha", () => {
    opened.push("replacement");
  });
  await expect(first.onComputerChoice()).rejects.toMatchObject({
    code: "CAPABILITY_DENIED",
  });
  expect(opened).toEqual(["alpha"]);
  const second = mountedEvents[1];
  if (!second) throw new Error("Expected replacement window events");
  await second.onComputerChoice();
  expect(opened).toEqual(["alpha", "replacement"]);
  await manager.dispose();
  await expect(second.onComputerChoice()).rejects.toMatchObject({
    code: "CAPABILITY_DENIED",
  });
});
