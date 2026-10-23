import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { keyWire } from "@fungi.computer/ear-tag/keys";
import { defineGrants } from "@fungi.computer/ear-tag/grants";
import {
  importShellModule,
  ShellModuleError,
  type RequestShellAppAccess,
} from "../src/shell-module.js";

const moduleUrl = (source: string) =>
  new URL(`data:text/javascript,${encodeURIComponent(source)}`);
const keysWire = keyWire(defineGrants({ capabilities: ["fixture.read"] }));

describe("importShellModule", () => {
  // Node has no DOM; the contract only needs the element class to exist.
  beforeAll(() => {
    vi.stubGlobal(
      "HTMLElement",
      class HTMLElement {
        readonly tagName = "DIV";
      },
    );
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a shell module from another origin", async () => {
    await expect(
      importShellModule(
        new URL("https://elsewhere.test/ui/shell/rel/shell.js"),
        "https://oyster.test",
      ),
    ).rejects.toBeInstanceOf(ShellModuleError);
  });

  it("refuses a module that does not export mountShell", async () => {
    const url = moduleUrl("export const mount = () => {};");
    await expect(importShellModule(url, url.origin)).rejects.toThrow(
      "The picked shell does not export mountShell",
    );
  });

  it("returns the module's mountShell and no Settings of its own", async () => {
    const url = moduleUrl(
      "export const mountShell = async () => () => undefined;",
    );
    const shell = await importShellModule(url, url.origin);
    expect(shell.mountShell).toBeInstanceOf(Function);
    expect(shell.mountPlatformControls).toBeNull();
  });

  it("returns the shell's own Settings when it offers them", async () => {
    const url = moduleUrl(
      [
        "export const mountShell = async () => () => undefined;",
        "const off = () => () => undefined;",
        "export const mountPlatformControls = async (root, { teamId, requestAppAccess, keysWire }) => {",
        "  keysWire.revoke.parse({ keyId: 'host-key', requestId: 'host-request' });",
        "  return {",
        "  controls: { sections: ['keys'], parseSettings: (value) => ({ teamId, value }),",
        "    openSettings: () => undefined, subscribeSettingsClosed: off,",
        "    subscribeChanges: off, attachDesktopSettings: off,",
        "    requestAppAccess: (target, input) => requestAppAccess(target, input, {",
        "      ask: async () => 'declined', customize: () => 'customize' }) },",
        "  suggestDesktopSettings: () => undefined, dispose: () => undefined,",
        "  };",
        "};",
      ].join("\n"),
    );
    const shell = await importShellModule(url, url.origin);
    const requestAppAccess = vi
      .fn<RequestShellAppAccess>()
      .mockResolvedValue("granted");
    const mounted = await shell.mountPlatformControls?.(new HTMLElement(), {
      teamId: "https://oyster.test",
      keysWire,
      requestAppAccess,
    });
    expect(mounted?.controls.sections).toEqual(["keys"]);
    expect(mounted?.controls.parseSettings("keys")).toEqual({
      teamId: "https://oyster.test",
      value: "keys",
    });
    await expect(
      mounted?.controls.requestAppAccess(
        { surfaceId: "s", title: "t", computerId: "computer-a" },
        { agents: [] },
      ),
    ).resolves.toBe("granted");
    expect(requestAppAccess).toHaveBeenCalledOnce();
    const [call] = requestAppAccess.mock.calls;
    expect(call?.[0]).toEqual({
      surfaceId: "s",
      title: "t",
      computerId: "computer-a",
    });
    expect(call?.[1]).toEqual({ agents: [] });
    expect(call?.[2].ask).toBeInstanceOf(Function);
    expect(call?.[2].customize).toBeInstanceOf(Function);
  });

  it("refuses Settings that break the contract", async () => {
    const url = moduleUrl(
      [
        "export const mountShell = async () => () => undefined;",
        "export const mountPlatformControls = async () => ({ controls: {} });",
      ].join("\n"),
    );
    const shell = await importShellModule(url, url.origin);
    await expect(
      shell.mountPlatformControls?.(new HTMLElement(), {
        teamId: "t",
        keysWire,
        requestAppAccess: () => Promise.resolve("declined"),
      }),
    ).rejects.toThrow();
  });
});
