import assert from "node:assert/strict";

// The public entries load in a plain process without Worker globals or any
// private workspace dependency. DOM work begins only when invoked.
const shell = await import("@fungi.computer/nacre");
const commandHost = await import("@fungi.computer/nacre/command-host");
const keys = await import("@fungi.computer/nacre/keys");
const commands = await import("@fungi.computer/nacre/commands");
const windows = await import("@fungi.computer/nacre/window-manager");
const workbench = await import("@fungi.computer/nacre/workbench");
await import("@fungi.computer/nacre/app-directory");
assert.equal(shell.createWindowManager, windows.createWindowManager);
assert.equal(
  shell.createAppSurfaceCommandHost,
  commandHost.createAppSurfaceCommandHost,
);
assert.equal(shell.shellCommands, commands.shellCommands);
assert.deepEqual(keys.parseChord("mod+k", false), {
  key: "k",
  alt: false,
  ctrl: true,
  meta: false,
  shift: false,
});
const shellCommandsHost = commandHost.createAppSurfaceCommandHost();
const declaredMount = shellCommandsHost.mount("packed-app", []);
await assert.rejects(
  declaredMount.handlers.registerCommands({
    commands: [{ id: "undeclared", title: "Undeclared", category: "App" }],
    invoke: async () => undefined,
  }),
  (error) => error.code === "COMMAND_NOT_DECLARED",
);
declaredMount.dispose();
shellCommandsHost.dispose();
let shellDisposals = 0;
const shellWindows = windows.createWindowManager({
  createContainer: () => ({}),
  mount: () => ({
    setVisibility: () => undefined,
    reconfigure: () => undefined,
    dispose: () => {
      shellDisposals += 1;
    },
  }),
});
await shellWindows.open({ windowId: "packed-window" });
assert.equal(shellWindows.read().windows[0].status, "ready");
await shellWindows.dispose();
assert.equal(shellDisposals, 1);
assert.equal(shellWindows.read().windows.length, 0);

assert.equal(workbench.WorkbenchHost.name, "WorkbenchHost");

for (const name of [
  "appDirectoryResponseSchema",
  "appComputerPermissionSchema",
  "appAgentPermissionSchema",
  "appMarketplacePermissionsSchema",
]) {
  assert.equal(name in shell, false, `Private Team contract leaked: ${name}`);
}
assert.equal(
  "computerPermission" in shell.appDirectoryEntrySchema.shape,
  false,
);
assert.equal(
  "marketplacePermissions" in shell.appDirectoryEntrySchema.shape,
  false,
);
assert.equal("agentPermission" in shell.appDirectoryEntrySchema.shape, false);
assert.equal("grants" in shell.appDirectoryEntrySchema.shape, false);
