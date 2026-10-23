import {
  rpcDataSchema,
  rpcHandleSchema,
  rpcMethod,
  rpcVoid,
} from "@fungi.computer/agar/rpc";
import * as z from "zod";
import * as Schema from "effect/Schema";
import { gillRequestSchema } from "@fungi.computer/gills";
import type {
  AppCommand,
  AppOpenRequest,
  FileNavigationInput,
  AppNavigationActivation,
  AppNavigationState,
  AppStatusAction,
  AppStatusItem,
} from "@fungi.computer/agar";
import type { AppOpenInput, AppRoleChoice } from "@fungi.computer/agar/apps";
import type {
  WhistleExecutionOrigin,
  WhistleJsonValue,
} from "@fungi.computer/whistle";

/** A request to resolve and mount one child App, by its own identity. */
export type WorkbenchChildLaunch = Readonly<{
  /** The window that owns the child. */
  windowId: string;
  /** The App to mount. */
  appId: string;
  /** The Release of the App to mount. */
  releaseId: string;
  /** The App surface to mount. */
  surfaceId: string;
  /** The address the child's surface is opened at. */
  href: string;
  /** The title shown for the window. */
  title?: string;
  /** The App-open handoff delivered to the child at launch, or null. */
  openRequest: AppOpenRequest | null;
}>;

/** One invocation of a mounted child's own Release-declared command. */
export type WorkbenchCommandInvocation = Readonly<{
  /** The command's input, when it takes any. */
  arguments?: WhistleJsonValue;
  /** What caused the command to run, such as a key press. */
  origin: WhistleExecutionOrigin;
}>;

/**
 * Events a mounted child raises toward its dashboard. A child's permission
 * requests never reach the dashboard: the host asks the person itself. The
 * host validates a
 * child's commands against that child's own Release declaration before
 * forwarding them, so the dashboard can present them but never widen them.
 */
export type WorkbenchChildEvents = Readonly<{
  /** Ask this window's shell to open its existing Computer picker. */
  onComputerChoice?: () => Promise<void>;
  /** Ask the embedding host to follow a file navigation request. */
  onNavigation?: (input: FileNavigationInput) => Promise<void>;
  /** Ask the embedding host to open an App through its own admission policy. */
  onAppOpen?: (input: AppOpenInput) => Promise<void>;
  /** Ask the embedding host which App its role routing would open for a role. */
  onAppRole?: (role: string) => Promise<AppRoleChoice>;
  /** Report a changed child selection; the host returns whether it handled it. */
  onSelectionChanged?: () => Promise<boolean>;
  /**
   * Replace the child's presented command set; an empty list clears it. Run
   * one through the child's handle with `invokeCommand`.
   */
  onCommands?: (commands: readonly AppCommand[]) => Promise<void>;
  /** A reserved shell chord (the command palette) pressed inside the child. */
  onReservedChord?: (
    input: Readonly<{ id: string; repeat: boolean }>,
  ) => Promise<void>;
  /** The child gained (`true`) or lost (`false`) input focus. */
  onFocus?: (focused: boolean) => Promise<void>;
  /**
   * The child's latest parsed navigation state; `null` once it disconnects.
   * The dashboard shows a Back affordance from it.
   */
  onNavigationState?: (state: AppNavigationState | null) => Promise<void>;
  /** The child's latest status readouts; an empty list once it disconnects. */
  onStatusItems?: (items: readonly AppStatusItem[]) => Promise<void>;
}>;

/** One mounted child App; every method proxies to its real host-owned mount. */
export type WorkbenchChildHandle = {
  /** Show or hide the mounted child without changing its identity. */
  setVisibility(visibility: "hidden" | "visible"): Promise<void>;
  /** Update the launch descriptor of the existing mount. */
  reconfigure(launch: WorkbenchChildLaunch): Promise<void>;
  /** Ask whether the child permits a user-initiated close. */
  requestClose(): Promise<boolean>;
  /** Ask the child to go back one step in its own history; `true` when it did. */
  requestBack(): Promise<boolean>;
  /** Deliver the person's use of a child's status item; `true` when it acted. */
  activateStatus(action: AppStatusAction): Promise<boolean>;
  /** Deliver the person's use of a child's crumb or header command; `true` when it acted. */
  activateNavigation(activation: AppNavigationActivation): Promise<boolean>;
  /** Run one of the child's currently presented commands. */
  invokeCommand(
    commandId: string,
    input: WorkbenchCommandInvocation,
  ): Promise<WhistleJsonValue | undefined>;
  /** Release the child mount and its resources. */
  dispose(): Promise<void>;
};

/**
 * A platform destination the host offers the dashboard, such as opening
 * a host settings page. The host owns the labels and the navigation;
 * the dashboard only presents them and asks the host to follow one.
 */
export type WorkbenchPlatformDestination = Readonly<{
  /** The destination's id, which the host follows when asked to open it. */
  id: string;
  /** The name shown for the destination. */
  label: string;
}>;

/** A declared Gill request addressed to one host-selected App surface. */
export const workbenchGillRequestSchema = Schema.Struct({
  /** The App surface the Gill request is addressed to. */
  surfaceId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(513),
  ),
  ...gillRequestSchema.fields,
});
/** Decoded Gill request for a surface in the host directory. */
export type WorkbenchGillRequest = typeof workbenchGillRequestSchema.Type;
/** The member chooses a declared Gill and size in host-rendered Settings. */
export const desktopGillSelectionSchema = z.strictObject({
  /** The App surface that declares the Gill. */
  surfaceId: z.string().min(1).max(256),
  /** The id of the Gill. */
  gillId: z.string().min(1).max(80),
});
/** The identity of a Gill selected in a host-rendered settings view. */
export type DesktopGillSelection = z.output<typeof desktopGillSelectionSchema>;
/** The dashboard layout sizes currently assigned to one Gill. */
export const desktopGillSizesSchema = z
  .array(
    z.enum({
      /** Small: one dashboard cell. */
      S: "S",
      /** Medium: two cells wide, one tall. */
      M: "M",
      /** Large: two cells wide, two tall. */
      L: "L",
    }),
  )
  .max(24);
/** A selected Gill and the layout size requested for a new placement. */
export const desktopGillAdditionSchema = desktopGillSelectionSchema.extend({
  /** The layout size for the new placement. */
  size: z.enum({
    /** Small: one dashboard cell. */
    S: "S",
    /** Medium: two cells wide, one tall. */
    M: "M",
    /** Large: two cells wide, two tall. */
    L: "L",
  }),
});
/** A decoded request to add a Gill placement. */
export type DesktopGillAddition = z.output<typeof desktopGillAdditionSchema>;
/** A dashboard supplies its own arranger, not an endpoint for ordinary Apps. */
export type WorkbenchDesktopSettings = {
  /** Read the sizes currently assigned to this Gill in the dashboard layout. */
  readGill: (
    input: DesktopGillSelection,
  ) => Promise<z.output<typeof desktopGillSizesSchema>>;
  /** Add a Gill at the requested size to the dashboard layout. */
  addGill: (input: DesktopGillAddition) => Promise<void>;
  /** Remove this Gill from the dashboard layout. */
  removeGill: (input: DesktopGillSelection) => Promise<void>;
};
/** Shape of the arranger callbacks the shell supplies to its host. */
export const desktopSettingsHandlerSchema = rpcHandleSchema({
  /** Read the sizes assigned to a Gill. */
  readGill: rpcMethod(rpcDataSchema(desktopGillSizesSchema)).input([
    desktopGillSelectionSchema,
  ]),
  /** Add a Gill placement. */
  addGill: rpcVoid.input([desktopGillAdditionSchema]),
  /** Remove a Gill from the layout. */
  removeGill: rpcVoid.input([desktopGillSelectionSchema]),
});
/** A registration lease; close it when the dashboard unmounts. */
export type WorkbenchDesktopRegistration = {
  /** Release this host registration. */
  close(): Promise<void>;
};

/** A host-owned change subscription; close it when no longer visible. */
export type WorkbenchGillWatch = {
  /** Release this host registration. */
  close(): Promise<void>;
};

/** Runtime check for an App-open handoff arriving across an untrusted boundary. */
export const appOpenRequestSchema = Schema.Union([
  Schema.Struct({
    /** Marks a handoff that composes text. */
    kind: Schema.Literal("compose"),
    /** The id of the handoff. */
    requestId: Schema.String,
    /** The text to compose. */
    text: Schema.String,
  }),
  Schema.Struct({
    /** Marks a handoff that navigates. */
    kind: Schema.Literal("navigate"),
    /** The id of the handoff. */
    requestId: Schema.String,
    /** The navigation parameters. */
    params: Schema.Array(
      Schema.Struct({
        /** The parameter's key. */
        key: Schema.String,
        /** The parameter's value. */
        value: Schema.String,
      }),
    ),
  }),
]);

/** One Team Computer in a host's inventory: the wire of `computers()`. */
export const teamComputerSchema = z.strictObject({
  /** The Computer's id. */
  computerId: z.string().min(1),
  /** The name shown for the Computer. */
  name: z.string().min(1).max(256),
  /** When the Computer was created. */
  createdAt: z.number().int().nonnegative(),
  /** When the Computer last changed. */
  updatedAt: z.number().int().nonnegative(),
});
/** A decoded Team Computer inventory record. */
export type TeamComputer = z.output<typeof teamComputerSchema>;
/** One page of a host's Team Computer inventory. */
export const teamComputerDirectorySchema = z.strictObject({
  /** The Computers in this page. */
  computers: z.array(teamComputerSchema),
  /** The offset of the next page, or null when this was the last. */
  nextOffset: z.number().int().nonnegative().nullable(),
});
