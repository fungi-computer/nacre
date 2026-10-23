# Nacre (`@fungi.computer/nacre`)

Nacre is mother-of-pearl, the lining an oyster grows on the inside of its shell.
This package is that lining for App hosts: the shell client that windows,
commands, keys and the App directory are built from. Oyster's page uses it, and
any shell can import it without the Oyster server.

## Install or set up

```sh
pnpm add @fungi.computer/nacre
```

The package is ESM-only. It depends on `@fungi.computer/agar`,
`@fungi.computer/ear-tag`, `@fungi.computer/gills`, `@fungi.computer/puffball`,
`@fungi.computer/whistle`, `effect` and `zod`.

## Quick start

```ts
import { createWindowManager } from "@fungi.computer/nacre";

const windows = createWindowManager({
  createContainer: () => ({}),
  mount: () => ({
    setVisibility: () => undefined,
    reconfigure: () => undefined,
    dispose: () => undefined,
  }),
});
await windows.open({ windowId: "notes" });
```

## Core concepts

`@fungi.computer/nacre` supplies the client side of hosting Apps. It can be
imported independently of the Workers server and Node packing helpers. The same
exports are available through focused entries:

| Entry              | Contract                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| `./workbench`      | Workbench host contract, shared child-window host, Gill layout and arranger shapes. |
| `./command-host`   | A Whistle graph that admits mounted commands against verified Release declarations. |
| `./keys`           | DOM key dispatch and shared chord matching.                                         |
| `./commands`       | Window, App picker and command palette declarations over host callbacks.            |
| `./window-manager` | Window generations, visibility, navigation, cancellation and disposal.              |
| `./app-directory`  | App addresses, reusable directory rows and catalog metadata.                        |

`./shell-module` is the contract between a host and the shell it runs, and is
imported on its own rather than through the root entry. A shell Release exports
`mountShell(root, input)` (`MountShell`); `input` (`ShellMountInput`) carries
the workbench handle, the shell installation's `AppStorage` and
`methods.call(method, input)` for its declared backend methods, which takes the
input as JSON text and resolves with the decoded JSON result.
`importShellModule(moduleUrl, hostOrigin)` imports the picked shell's module
from the host's own origin, checks that it exports `mountShell`, and rejects
with `ShellModuleError` otherwise. The host never bundles a shell.

Supply your own mount adapter to `createWindowManager`. It receives the
container, launch descriptor, cancellation signal and navigation callbacks; its
returned handle owns visibility, reconfiguration and disposal. The manager
disposes stale mounts and serializes changes to each window. It neither picks
Apps nor grants capabilities.

`createAppSurfaceCommandHost` owns command contribution and focus. Give
`mount(id, declarations)` the verified Release's declarations and pass the
returned handlers to Agar's `connectAppHost`. A mounted App cannot introduce an
undeclared command or claim the reserved shell chord. Dispose its command mount
when its iframe closes, and dispose the command host with the shell.
`installShellKeys` attaches DOM listeners only when called; its return value
removes them. Terminal shells can use the command and window owners without a
DOM.

Directory metadata is not launch authority. A host extends the public row schema
with its own permission model and admits each mount itself. Fungi's Team
directory, Team settings capability and signed Hub/host protocol live in its
private consumers; the public shell imports none of them.

## API reference

The generated reference is in [docs/api](docs/api/README.md).

## Examples and checks

- `pnpm --filter @fungi.computer/nacre test` runs the window manager, command
  host, shell module and App catalog tests.
- `pnpm --filter @fungi.computer/nacre stranger` packs the package and
  typechecks and runs a consumer against the tarball.

## Limits and errors

Directory metadata is not launch authority, and a mounted App cannot introduce
an undeclared command. `importShellModule` rejects a module that does not export
`mountShell` with `ShellModuleError`.

## Contribute and license

Changes land through the Botanical repository. MIT licensed; see
[LICENSE](LICENSE).
