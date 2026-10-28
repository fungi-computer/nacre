import { AppError } from "@fungi.computer/agar/errors";
import type { AppCommand } from "@fungi.computer/agar";

/** An optional field a declaration may carry as explicitly undefined. */
export type AppCommandOptional<T> = T | undefined;

/**
 * The digest-covered command rows a mounted App's Release declares, as the
 * host receives them. Oyster compares and projects them; the Release
 * declaration grammar stays with its owner, which hands rows of this shape.
 */
export type AppCommandDeclaration = Readonly<{
  /** The command's id inside the App's Release declaration. */
  id: string;
  /** The name people see for the command. */
  title: string;
  /** The group the command is listed under. */
  category: string;
  /** What the command does, in a sentence. */
  description?: AppCommandOptional<string>;
  /** Where the command is offered, with a sort position for each place. */
  projections?: AppCommandOptional<
    Readonly<{
      /** Key bindings that run the command. */
      bindings?: AppCommandOptional<
        Readonly<{
          /** Sort position among the binding rows. */
          order?: AppCommandOptional<number>;
          /**
           * The binding strings, such as alt+left or a sequence after the
           * leader key.
           */
          values: readonly string[];
        }>
      >;
      /** The command as offered to an agent. */
      agent?: AppCommandOptional<
        Readonly<{
          /** Sort position among the agent rows. */
          order?: AppCommandOptional<number>;
          /** The key binding an agent uses to run the command. */
          keybind?: AppCommandOptional<string>;
        }>
      >;
      /** The command as listed in help. */
      help?: AppCommandOptional<
        Readonly<{
          /** Sort position among the help rows. */
          order?: AppCommandOptional<number>;
        }>
      >;
      /** The command as listed in a menu. */
      menu?: AppCommandOptional<
        Readonly<{
          /** Sort position among the menu rows. */
          order?: AppCommandOptional<number>;
        }>
      >;
      /** The command as listed in the command palette. */
      palette?: AppCommandOptional<
        Readonly<{
          /** Sort position among the palette rows. */
          order?: AppCommandOptional<number>;
        }>
      >;
      /** The command as a slash command. */
      slash?: AppCommandOptional<
        Readonly<{
          /** Sort position among the slash rows. */
          order?: AppCommandOptional<number>;
          /** Other slash names that run the command. */
          aliases: readonly string[];
        }>
      >;
    }>
  >;
}>;
import type {
  AppHostHandlers,
  AppCommandContribution,
  AppHostReservedChord,
} from "@fungi.computer/agar/host";
import {
  createWhistle,
  sameWhistleCommand,
  scopeSnapshot,
  type WhistleExecutionInput,
  type WhistleExecutionOutcome,
  type WhistleContribution,
  type WhistleContributionLease,
  type WhistleCommand,
  type WhistleCommandKey,
  type WhistleMenuProjection,
  type WhistleProjectionRow,
  type WhistlePresenter,
  type WhistleRuntime,
  type WhistleSnapshot,
} from "@fungi.computer/whistle";

type RegisterCommandsInput = Parameters<AppHostHandlers["registerCommands"]>[0];
type RegisterCommands = AppHostHandlers["registerCommands"];
const emptyMenu: readonly WhistleMenuProjection[] = Object.freeze([]);
/** The shell command an App's reserved command-palette chord runs. */
const commandPaletteCommand: WhistleCommandKey = Object.freeze({
  namespace: "shell",
  id: "show-command-palette",
});
const commandPaletteReservedChord: AppHostReservedChord = Object.freeze({
  altKey: false,
  ctrlKey: false,
  id: "shell:show-command-palette",
  key: "k",
  metaKey: true,
  shiftKey: false,
});

/** Select the shell command-palette chord for a Mac or non-Mac keyboard. */
export function commandPaletteReservedChordForPlatform(
  mac: boolean,
): AppHostReservedChord {
  return Object.freeze({
    ...commandPaletteReservedChord,
    ctrlKey: !mac,
    metaKey: mac,
  });
}

/** Select the shell command-palette chord from the embedding browser user agent. */
export function commandPaletteReservedChordForUserAgent(
  userAgent: string,
): AppHostReservedChord {
  return commandPaletteReservedChordForPlatform(
    /Mac|iPhone|iPad/u.test(userAgent),
  );
}

/** One App command, named by its surface and its declared command id. */
export type AppCommandTarget = Readonly<{
  /** The App surface, such as `installation:inkcap`. */
  surfaceId: string;
  /** The command id the App's Release declares. */
  commandId: string;
}>;

/**
 * The typed Whistle identity of a command a mounted App surface contributed:
 * each mounted surface owns the Whistle namespace named by its surface id.
 *
 * @param target - The App surface and its declared command id.
 * @returns The key every snapshot row of that command carries as `command`.
 */
export function appSurfaceCommandKey(
  target: AppCommandTarget,
): WhistleCommandKey {
  return Object.freeze({ namespace: target.surfaceId, id: target.commandId });
}

/** Whistle source of Release-advertised rows for Apps not yet mounted. */
export const appDirectorySourceId = "app-directory";

/** Bindings an App may never claim: the leader chord crosses every iframe. */
const reservedBindings = new Set([
  "super+k",
  "meta+k",
  "cmd+k",
  "mod+k",
  "ctrl+k",
  "control+k",
]);

/** The command side of one mounted App's host handlers. */
export type AppSurfaceCommandMount = Readonly<{
  /** Borrow this mount's live Agent projection and gated execution, not the shell graph. */
  readonly agentCommands: Pick<WhistleRuntime, "snapshot" | "execute">;
  /** The narrow handler shape consumed by Agar's App host connection. */
  readonly handlers: Pick<
    AppHostHandlers,
    "registerCommands" | "invokeReservedChord"
  >;
  /** Release this App's contribution and its mount identity. */
  readonly dispose: () => void;
}>;

/** Commands owned by one pane, projected to globals plus its focus scope. */
export type PaneCommands = Readonly<{
  /**
   * The key of a command this pane contributed.
   *
   * @param id - The command's local id.
   * @param group - The group it was contributed under, if any.
   */
  command: (id: string, group?: string) => WhistleCommandKey;
  /**
   * Contribute or replace commands owned by this pane through the returned
   * lease. A group gives one embedded source (such as a Parakeet contribution)
   * its own namespace inside the pane, so its ids never collide with others.
   */
  contribute: (
    commands: readonly WhistleCommand<never>[],
    group?: string,
  ) => WhistleContributionLease;
  /** Run a command by id. */
  execute: WhistleRuntime["execute"];
  /** Read the commands and bindings currently available. */
  snapshot: WhistleRuntime["snapshot"];
  /** Be told when the available commands change. */
  subscribe: WhistleRuntime["subscribe"];
  /** Registered locally; only the focused pane presents human executions. */
  present: WhistleRuntime["present"];
}>;

/** Closing a pane withdraws all its leases, presenters and subscriptions. */
export type PaneCommandMount = PaneCommands &
  Readonly<{
    /** Withdraw this pane's contributions, presenters and subscriptions. */
    dispose: () => void;
  }>;

/** The shell-owned Whistle graph and its focused menu projection. */
export type AppSurfaceCommandHost = Readonly<{
  /** Create the command scope for one locally rendered pane. */
  readonly mountPane: (paneId: string) => PaneCommandMount;
  /** Create one command admission scope for a mounted App. */
  readonly mount: (
    mountId: string,
    declarations: readonly AppCommandDeclaration[],
  ) => AppSurfaceCommandMount;
  /** Select the App or pane whose commands are the active human-facing ones. */
  readonly focus: (mountId: string | null) => void;
  /** Register the shell's own global commands in the shared Whistle graph. */
  readonly registerShellCommands: (
    commands: readonly WhistleCommand<never>[],
  ) => () => void;
  /** Publish verified Release command rows before their App is mounted. */
  readonly registerDirectoryCommands: (
    commands: readonly Readonly<{
      surfaceId: string;
      appTitle: string;
      command: AppCommandDeclaration;
    }>[],
    run: (surfaceId: string, commandId: string) => Promise<void>,
  ) => () => void;
  /**
   * The App command a snapshot row runs: a mounted App's own row, or a
   * directory row that opens its App first. Shell and pane rows have none.
   */
  readonly appCommand: (
    row: Pick<WhistleProjectionRow, "command" | "sourceId">,
  ) => AppCommandTarget | undefined;
  /** Read the menu rows belonging to the focused App. */
  readonly menu: () => readonly WhistleMenuProjection[];
  /**
   * The human-facing commands for the current focus: shell rows plus the
   * focused mount's rows, with its aliases and keys shadowing the shell's.
   */
  readonly active: () => WhistleSnapshot;
  /** Execute an active row, an agent row, or an exact programmatic action. */
  readonly execute: (
    command: WhistleCommandKey,
    input: WhistleExecutionInput,
  ) => Promise<WhistleExecutionOutcome>;
  /** Read the complete renderer-neutral graph for host consumers. */
  readonly snapshot: () => WhistleSnapshot;
  /** Observe graph changes, including contribution replacement and disposal. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Dispose all App contributions and close the shell runtime. */
  readonly dispose: () => void;
}>;

type MountState = {
  readonly id: string;
  readonly declarations: ReadonlyMap<string, AppCommandDeclaration>;
  disposed: boolean;
  contribution: AppCommandContribution | undefined;
};

type PaneState = {
  disposed: boolean;
  snapshot: WhistleSnapshot;
  readonly leases: Set<WhistleContributionLease>;
  readonly listeners: Set<() => void>;
  readonly presenters: { presenter: WhistlePresenter }[];
  readonly dispose: () => void;
};

function sameValues(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : left.length === right.length &&
        left.every((value, index) => value === right[index]);
}

function matchesBindings(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return (
    actual?.bindings?.order === declared?.bindings?.order &&
    sameValues(actual?.bindings?.values, declared?.bindings?.values)
  );
}

function matchesSlash(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return (
    actual?.slash?.order === declared?.slash?.order &&
    sameValues(actual?.slash?.aliases, declared?.slash?.aliases)
  );
}

function matchesAgent(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return (
    actual?.agent?.order === declared?.agent?.order &&
    actual?.agent?.keybind === declared?.agent?.keybind
  );
}

function matchesHelp(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return actual?.help?.order === declared?.help?.order;
}

function matchesMenu(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return actual?.menu?.order === declared?.menu?.order;
}

function matchesPalette(
  actual: AppCommand["projections"],
  declared: AppCommandDeclaration["projections"],
): boolean {
  return actual?.palette?.order === declared?.palette?.order;
}

function matchesDeclaration(
  command: AppCommand,
  declaration: AppCommandDeclaration,
): boolean {
  const actual = command.projections;
  const declared = declaration.projections;
  return (
    command.id === declaration.id &&
    command.title === declaration.title &&
    command.category === declaration.category &&
    command.description === declaration.description &&
    matchesBindings(actual, declared) &&
    matchesAgent(actual, declared) &&
    matchesHelp(actual, declared) &&
    matchesMenu(actual, declared) &&
    matchesPalette(actual, declared) &&
    matchesSlash(actual, declared)
  );
}

/**
 * Own one shell's Whistle runtime for mounted Apps and local panes. The
 * embedding host supplies verified Release declarations and decides which
 * App or pane has focus.
 *
 * Agar invokes `registerCommands` once for the aggregate command set of a
 * mount. The adapter keeps that aggregate as one Whistle generation, so an
 * Agar update replaces the generation atomically and disposal releases only
 * that App. Command handlers remain the App's callback; the shell only adds
 * the Whistle identity and routes focused menu execution to it.
 */
export function createAppSurfaceCommandHost(
  whistle: WhistleRuntime = createWhistle(),
): AppSurfaceCommandHost {
  const mounts = new Map<string, MountState>();
  const panes = new Map<string, PaneState>();
  const listeners = new Set<() => void>();
  let focusedMount: string | null = null;
  let activeSnapshot: WhistleSnapshot = scopeSnapshot(whistle.snapshot(), null);
  let focusedMenu: readonly WhistleMenuProjection[] = emptyMenu;
  let shellContribution: WhistleContributionLease | undefined;
  let directoryContribution: WhistleContributionLease | undefined;
  let disposed = false;
  let disposePresenter: (() => void) | undefined;
  const refreshPresenter = (): void => {
    disposePresenter?.();
    disposePresenter = undefined;
    if (disposed) return;
    const presenter =
      focusedMount === null
        ? undefined
        : panes.get(focusedMount)?.presenters.at(-1)?.presenter;
    if (presenter !== undefined) disposePresenter = whistle.present(presenter);
  };
  const publish = (): void => {
    for (const listener of listeners) listener();
  };
  const projectFocus = (graph: WhistleSnapshot): void => {
    activeSnapshot = scopeSnapshot(graph, focusedMount);
    focusedMenu =
      focusedMount === null
        ? emptyMenu
        : Object.freeze(
            activeSnapshot.menu.filter(
              (command) => command.scope === focusedMount,
            ),
          );
  };
  // Pane snapshots are scoped to fixed pane IDs, so a focus change alone
  // leaves them, and their subscribers, untouched.
  const refreshFocus = (): void => {
    projectFocus(whistle.snapshot());
    publish();
  };
  // One atomic recomputation per graph change: subscribers never see two Apps
  // active at once.
  const refreshMenu = (): void => {
    const graph = whistle.snapshot();
    projectFocus(graph);
    for (const [id, pane] of panes) {
      if (pane.disposed) continue;
      pane.snapshot = scopeSnapshot(graph, id);
      for (const listener of pane.listeners) listener();
    }
    publish();
  };
  const unsubscribeWhistle = whistle.subscribe(refreshMenu);

  const assertLive = (): void => {
    if (disposed) throw new Error("App command host is disposed");
  };

  const contributionFor = (
    mount: MountState,
    input: RegisterCommandsInput,
    commands: readonly AppCommand[],
  ): WhistleContribution => {
    for (const command of commands) {
      const declaration = mount.declarations.get(command.id);
      if (
        declaration === undefined ||
        !matchesDeclaration(command, declaration)
      )
        throw new AppError(
          `App command ${command.id} does not match its Release declaration`,
          { code: "COMMAND_NOT_DECLARED", retryable: false },
        );
      for (const binding of command.projections?.bindings?.values ?? [])
        if (reservedBindings.has(binding.trim().toLowerCase()))
          throw new Error("App commands cannot bind the reserved leader chord");
    }
    return {
      sourceId: mount.id,
      namespace: mount.id,
      scope: mount.id,
      commands: commands.map((command): WhistleCommand<never> => {
        // Agar carries a static availability fact; Whistle evaluates availability
        // through its existing function-shaped runtime contract.
        const { availability, projections, description, action, ...metadata } =
          command;
        const converted: WhistleCommand<never> = {
          ...metadata,
          handler: (execution: WhistleExecutionInput) => {
            const invocation: Parameters<RegisterCommandsInput["invoke"]>[1] = {
              origin: execution.origin,
            };
            if (execution.arguments !== undefined)
              Object.assign(invocation, { arguments: execution.arguments });
            if (execution.signal !== undefined)
              Object.assign(invocation, { signal: execution.signal });
            return input.invoke(command.id, invocation);
          },
        };
        if (availability !== undefined)
          Object.assign(converted, { availability: () => availability });
        // Whistle's optional fields reject explicit undefined; copy only present ones.
        if (projections !== undefined)
          Object.assign(converted, { projections });
        if (description !== undefined)
          Object.assign(converted, { description });
        if (action !== undefined) Object.assign(converted, { action });
        return converted;
      }),
    };
  };

  const mount = (
    mountId: string,
    declarations: readonly AppCommandDeclaration[],
  ): AppSurfaceCommandMount => {
    assertLive();
    if (mountId.trim().length === 0)
      throw new Error("App command mount ID must not be blank");
    if (mounts.has(mountId) || panes.has(mountId))
      throw new Error("App command mount ID is already active");

    const state: MountState = {
      id: mountId,
      declarations: new Map(
        declarations.map((command) => [command.id, command]),
      ),
      disposed: false,
      contribution: undefined,
    };
    mounts.set(mountId, state);

    const registerCommands: RegisterCommands = (input) =>
      Promise.resolve().then(() => {
        assertLive();
        if (state.disposed) throw new Error("App command mount is disposed");
        if (state.contribution !== undefined)
          throw new Error("App command mount already registered commands");

        const lease = whistle.contribute(
          contributionFor(state, input, input.commands),
        );
        let active = true;
        const contribution: AppCommandContribution = {
          update: (commands) => {
            if (!active || state.disposed || disposed) return;
            lease.update(contributionFor(state, input, commands).commands);
          },
          dispose: () => {
            if (!active) return;
            active = false;
            lease.dispose();
            if (state.contribution === contribution)
              state.contribution = undefined;
          },
        };
        state.contribution = contribution;
        return contribution;
      });

    const invokeReservedChord: AppHostHandlers["invokeReservedChord"] = async (
      input,
    ) => {
      assertLive();
      if (state.disposed || input.id !== commandPaletteReservedChord.id)
        throw new Error("App reserved chord is unavailable");
      if (input.repeat) return;
      const outcome = await execute(commandPaletteCommand, {
        origin: "browser",
      });
      if (outcome.status !== "handled")
        throw new Error("App reserved chord could not run");
    };

    const agentSnapshot = (): WhistleSnapshot => ({
      bindings: [],
      palette: [],
      slash: [],
      help: [],
      menu: [],
      agent:
        state.disposed || disposed
          ? []
          : whistle.snapshot().agent.filter((row) => row.scope === state.id),
    });
    const agentCommands: AppSurfaceCommandMount["agentCommands"] =
      Object.freeze({
        snapshot: agentSnapshot,
        execute: (
          command: WhistleCommandKey,
          input: WhistleExecutionInput,
        ): Promise<WhistleExecutionOutcome> => {
          if (
            input.origin !== "agent" ||
            !agentSnapshot().agent.some((row) =>
              sameWhistleCommand(row.command, command),
            )
          )
            return Promise.resolve({ status: "missing" });
          return execute(command, input);
        },
      });
    return Object.freeze({
      agentCommands,
      handlers: Object.freeze({ registerCommands, invokeReservedChord }),
      dispose: () => {
        if (state.disposed) return;
        state.disposed = true;
        state.contribution?.dispose();
        state.contribution = undefined;
        mounts.delete(state.id);
        if (focusedMount === state.id) {
          focusedMount = null;
          refreshMenu();
        }
      },
    });
  };

  const mountPane = (paneId: string): PaneCommandMount => {
    assertLive();
    if (paneId.trim().length === 0)
      throw new Error("Pane command mount ID must not be blank");
    if (mounts.has(paneId) || panes.has(paneId))
      throw new Error("Pane command mount ID is already active");
    const namespace = `pane:${paneId}`;
    // A group is a namespace nested under the pane's own.
    const groupNamespace = (group: string | undefined) =>
      group === undefined ? namespace : `${namespace}/${group}`;
    const ownedCommands = new Map<
      WhistleContributionLease,
      readonly WhistleCommandKey[]
    >();
    const state: PaneState = {
      disposed: false,
      snapshot: scopeSnapshot(whistle.snapshot(), paneId),
      leases: new Set(),
      listeners: new Set(),
      presenters: [],
      dispose: () => {
        if (state.disposed) return;
        state.disposed = true;
        state.listeners.clear();
        state.presenters.length = 0;
        for (const lease of state.leases) lease.dispose();
        state.leases.clear();
        ownedCommands.clear();
        state.snapshot = scopeSnapshot(whistle.snapshot(), paneId);
        panes.delete(paneId);
        if (focusedMount === paneId) {
          focusedMount = null;
          refreshMenu();
        }
        refreshPresenter();
      },
    };
    panes.set(paneId, state);
    const assertPaneLive = (): void => {
      assertLive();
      if (state.disposed) throw new Error("Pane command mount is disposed");
    };
    const checkBindings = (commands: readonly WhistleCommand<never>[]) => {
      for (const command of commands)
        for (const binding of command.projections?.bindings?.values ?? [])
          if (reservedBindings.has(binding.trim().toLowerCase()))
            throw new Error(
              "Pane commands cannot bind the reserved leader chord",
            );
    };
    return Object.freeze({
      command: (id: string, group?: string) =>
        Object.freeze({ namespace: groupNamespace(group), id }),
      contribute: (
        commands: readonly WhistleCommand<never>[],
        group?: string,
      ) => {
        assertPaneLive();
        checkBindings(commands);
        const contributed = groupNamespace(group);
        const underlying = whistle.contribute({
          sourceId: `pane:${paneId}`,
          namespace: contributed,
          scope: paneId,
          commands,
        });
        const keys = (next: readonly WhistleCommand<never>[]) =>
          next.map((command) =>
            Object.freeze({ namespace: contributed, id: command.id }),
          );
        let active = true;
        const lease: WhistleContributionLease = Object.freeze({
          update: (replacement: readonly WhistleCommand<never>[]) => {
            if (!active || state.disposed || disposed) return;
            checkBindings(replacement);
            underlying.update(replacement);
            ownedCommands.set(lease, keys(replacement));
          },
          dispose: () => {
            if (!active) return;
            active = false;
            state.leases.delete(lease);
            ownedCommands.delete(lease);
            underlying.dispose();
          },
        });
        state.leases.add(lease);
        ownedCommands.set(lease, keys(commands));
        return lease;
      },
      execute: (command: WhistleCommandKey, input: WhistleExecutionInput) => {
        const snapshot = state.snapshot;
        const rows =
          input.origin === "agent"
            ? [snapshot.agent]
            : [
                snapshot.bindings,
                snapshot.palette,
                snapshot.slash,
                snapshot.help,
                snapshot.menu,
                snapshot.agent,
              ];
        // A catalog action can be callable from an admitted row without a menu
        // or palette projection. Its contribution still belongs to this pane.
        const owned =
          input.origin !== "agent" &&
          [...ownedCommands.values()].some((keys) =>
            keys.some((key) => sameWhistleCommand(key, command)),
          );
        const admitted =
          owned ||
          rows.some((projection) =>
            projection.some((row) => sameWhistleCommand(row.command, command)),
          );
        const human =
          input.origin !== "programmatic" && input.origin !== "agent";
        if (
          state.disposed ||
          disposed ||
          !admitted ||
          (human && focusedMount !== paneId)
        )
          return Promise.resolve({ status: "missing" } as const);
        return whistle.execute(command, input);
      },
      snapshot: () => state.snapshot,
      subscribe: (listener: () => void) => {
        if (state.disposed || disposed) return () => undefined;
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      },
      present: (presenter: WhistlePresenter) => {
        assertPaneLive();
        const entry = { presenter };
        state.presenters.push(entry);
        refreshPresenter();
        return () => {
          const index = state.presenters.indexOf(entry);
          if (index === -1) return;
          state.presenters.splice(index, 1);
          refreshPresenter();
        };
      },
      dispose: state.dispose,
    });
  };

  const focus = (mountId: string | null): void => {
    const state =
      mountId === null
        ? undefined
        : (mounts.get(mountId) ?? panes.get(mountId));
    const nextFocus =
      mountId !== null && state !== undefined && !state.disposed
        ? mountId
        : null;
    if (focusedMount === nextFocus) return;
    focusedMount = nextFocus;
    refreshPresenter();
    refreshFocus();
  };

  const registerShellCommands = (
    commands: readonly WhistleCommand<never>[],
  ): (() => void) => {
    assertLive();
    shellContribution?.dispose();
    const contribution = whistle.contribute({
      sourceId: "shell",
      namespace: "shell",
      commands,
    });
    shellContribution = contribution;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      contribution.dispose();
      if (shellContribution === contribution) shellContribution = undefined;
    };
  };

  // Directory rows share one namespace; each row's local id is an opaque
  // index whose App command target this map holds.
  let directoryTargets: ReadonlyMap<string, AppCommandTarget> = new Map();
  const registerDirectoryCommands: AppSurfaceCommandHost["registerDirectoryCommands"] =
    (rows, run) => {
      assertLive();
      directoryContribution?.dispose();
      const targets = new Map<string, AppCommandTarget>();
      const contribution = whistle.contribute({
        sourceId: appDirectorySourceId,
        namespace: appDirectorySourceId,
        commands: rows.flatMap(({ surfaceId, appTitle, command }, index) => {
          const palette = command.projections?.palette;
          if (palette === undefined) return [];
          const id = `entry-${String(index)}`;
          targets.set(id, Object.freeze({ surfaceId, commandId: command.id }));
          const projected: WhistleCommand<never> = {
            id,
            title: command.title,
            category: `${appTitle} · ${command.category}`,
            projections: {
              palette:
                palette.order === undefined ? {} : { order: palette.order },
            },
            handler: () => run(surfaceId, command.id),
          };
          return command.description === undefined
            ? [projected]
            : [{ ...projected, description: command.description }];
        }),
      });
      directoryContribution = contribution;
      directoryTargets = targets;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        contribution.dispose();
        if (directoryContribution === contribution) {
          directoryContribution = undefined;
          directoryTargets = new Map();
        }
      };
    };

  const appCommand: AppSurfaceCommandHost["appCommand"] = (row) => {
    if (row.sourceId === appDirectorySourceId)
      return row.command.namespace === appDirectorySourceId
        ? directoryTargets.get(row.command.id)
        : undefined;
    return mounts.has(row.sourceId) && row.command.namespace === row.sourceId
      ? Object.freeze({ surfaceId: row.sourceId, commandId: row.command.id })
      : undefined;
  };

  const menu = (): readonly WhistleMenuProjection[] => focusedMenu;
  const isActive = (command: WhistleCommandKey): boolean => {
    const { bindings, palette, slash, help, menu: rows } = activeSnapshot;
    return [bindings, palette, slash, help, rows].some((projection) =>
      projection.some((row) => sameWhistleCommand(row.command, command)),
    );
  };

  const execute = async (
    command: WhistleCommandKey,
    input: WhistleExecutionInput,
  ): Promise<WhistleExecutionOutcome> => {
    if (
      input.origin === "agent" &&
      !whistle
        .snapshot()
        .agent.some((row) => sameWhistleCommand(row.command, command))
    )
      return { status: "missing" };
    if (
      input.origin !== "programmatic" &&
      input.origin !== "agent" &&
      !isActive(command)
    )
      return { status: "missing" };
    return whistle.execute(command, input);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    disposePresenter?.();
    disposePresenter = undefined;
    for (const pane of panes.values()) pane.dispose();
    for (const state of mounts.values()) {
      state.disposed = true;
      state.contribution?.dispose();
      state.contribution = undefined;
    }
    shellContribution?.dispose();
    shellContribution = undefined;
    directoryContribution?.dispose();
    directoryContribution = undefined;
    directoryTargets = new Map();
    mounts.clear();
    focusedMount = null;
    focusedMenu = emptyMenu;
    whistle.close();
    activeSnapshot = whistle.snapshot();
    unsubscribeWhistle();
    listeners.clear();
  };

  return Object.freeze({
    mount,
    mountPane,
    focus,
    registerShellCommands,
    registerDirectoryCommands,
    appCommand,
    menu,
    active: () => activeSnapshot,
    execute,
    snapshot: whistle.snapshot,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose,
  });
}
