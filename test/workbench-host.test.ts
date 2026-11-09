// @vitest-environment jsdom
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { WorkbenchHost } from "../src/workbench-host.js";
import type { WorkbenchPreparedChild } from "../src/workbench-host-types.js";

/** Real child handle over an independently controlled host-resource lifetime. */
function childWorkbench(
  dispose: WorkbenchPreparedChild["dispose"],
  retryInstall?: (installationId: string) => Promise<void>,
) {
  const unavailable = (): never => {
    throw new Error("This fixture does not offer account or platform services");
  };
  const workbench = new WorkbenchHost({
    hostWindow: window,
    resolveLaunch: (input) => ({ launch: input }),
    prepareChild: () =>
      Promise.resolve({
        commands: [],
        dispose,
        mount: () =>
          Promise.resolve({
            setVisibility: () => Promise.resolve(),
            reconfigure: () => Promise.resolve(),
            requestClose: () => Promise.resolve(true),
            requestBack: () => Promise.resolve(false),
            activateNavigation: () => Promise.resolve(false),
            activateStatus: () => Promise.resolve(false),
            dispose: () => undefined,
          }),
      }),
    services: {
      team: unavailable,
      computers: unavailable,
      directory: unavailable,
      requestGill: unavailable,
      watchGillChanges: unavailable,
      memberAvatar: unavailable,
      suggestDesktopSettings: unavailable,
      dispose: unavailable,
    },
    platform: {
      destinations: unavailable,
      open: unavailable,
      takeAppOpenRequest: unavailable,
      controls: {
        retryInstall,
        parseSettings: unavailable,
        openSettings: unavailable,
        subscribeSettingsClosed: unavailable,
        subscribeChanges: unavailable,
        attachDesktopSettings: unavailable,
        requestAppAccess: unavailable,
      },
    },
    reportAgentSessionSelection: unavailable,
    log: unavailable,
  });
  const mount = () =>
    workbench.mount(
      document.createElement("div"),
      {
        windowId: "one",
        appId: "app",
        surfaceId: "surface",
        releaseId: "release",
        href: "/surface",
        openRequest: null,
      },
      { onAgentSessionSelection: () => Promise.resolve() },
      new AbortController().signal,
    );
  return Object.assign(mount, { workbench });
}

it("keeps overlapping child disposal pending until the window identity is released", async () => {
  const cleanup = Promise.withResolvers<undefined>();
  const dispose = vi.fn(() => cleanup.promise);
  const mount = childWorkbench(dispose);
  const child = await mount();
  const first = child.dispose();
  let secondFinished = false;
  const second = child.dispose().then(() => {
    secondFinished = true;
  });
  await setImmediate();
  const finishedBeforeCleanup = secondFinished;
  cleanup.resolve(undefined);
  await Promise.all([first, second]);
  expect(finishedBeforeCleanup).toBe(false);
  expect(dispose).toHaveBeenCalledTimes(1);
  const replacement = await mount();
  await replacement.dispose();
});

it("keeps a failed child disposal observable to overlapping and later callers", async () => {
  const cleanup = Promise.withResolvers<undefined>();
  const cause = new Error("host cleanup failed");
  const dispose = vi.fn(() => cleanup.promise);
  const child = await childWorkbench(dispose)();
  const first = expect(child.dispose()).rejects.toBe(cause);
  const second = expect(child.dispose()).rejects.toBe(cause);
  cleanup.reject(cause);
  await Promise.all([first, second]);
  await expect(child.dispose()).rejects.toBe(cause);
  expect(dispose).toHaveBeenCalledTimes(1);
});

it("retries only through the host's offered installation control", async () => {
  const retry = vi
    .fn<(id: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const { workbench } = childWorkbench(() => Promise.resolve(), retry);
  await workbench.retryInstall("starter");
  expect(retry).toHaveBeenCalledExactlyOnceWith("starter");
  await expect(workbench.retryInstall("")).rejects.toThrow();
  expect(retry).toHaveBeenCalledTimes(1);
  await expect(
    childWorkbench(() => Promise.resolve()).workbench.retryInstall("starter"),
  ).rejects.toThrow("This host cannot retry App installations");
});
