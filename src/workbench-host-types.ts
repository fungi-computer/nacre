import type {
  TeamWorkbenchChildEvents,
  TeamWorkbenchHostHandle,
} from "./workbench-contract.js";
import type {
  AgentSessionSelection,
  AppPermissionOutcome,
  AppPermissionRequest,
} from "@fungi.computer/agar";
import type { WhistleJsonValue } from "@fungi.computer/whistle";
import type {
  AppCommandDeclaration,
  AppSurfaceCommandMount,
} from "./command-host.js";
import type {
  WorkbenchChildHandle,
  WorkbenchChildLaunch,
  WorkbenchDesktopSettings,
  WorkbenchPlatformDestination,
} from "./workbench-model.js";

/** A launch checked against the embedding host's own installation authority. */
export type WorkbenchResolvedChild = Readonly<{
  /** The launch, without its title. */
  launch: Omit<WorkbenchChildLaunch, "title">;
  /** The title the host chose for the window. */
  title?: string;
}>;

/** The host's real mounted App; selection and lease replacement stay with it. */
export type WorkbenchChildSurface = Pick<
  WorkbenchChildHandle,
  | "setVisibility"
  | "requestClose"
  | "requestBack"
  | "activateStatus"
  | "activateNavigation"
> & {
  /** Release the mounted child or host-owned observations. */
  dispose(): void;
  /** Replace the host-admitted selection while retaining the child document. */
  reconfigure(launch: WorkbenchResolvedChild["launch"]): Promise<void>;
};

/** Inputs shared child-window mechanics supply to the host's admitted mount. */
export type WorkbenchChildMountOptions = Readonly<{
  /** The element the child is mounted in. */
  container: HTMLElement;
  /** The browser window that hosts the child. */
  hostWindow: Window;
  /** The title shown for the window. */
  title?: string;
  /** Where the child sends its events. */
  events: TeamWorkbenchChildEvents;
  /** Where the child's commands are mounted. */
  commands: AppSurfaceCommandMount;
  /** Suggest the child's admitted surface in host-rendered Settings. */
  onDesktopSettings: (surfaceId: string) => Promise<void>;
  /** Ask the host to obtain the person's approval for the child. */
  onPermissionRequest: (
    input: AppPermissionRequest,
    context: Pick<
      Parameters<WorkbenchHostControls["requestAppAccess"]>[0],
      "computerId"
    >,
  ) => Promise<AppPermissionOutcome>;
}>;

/** Host-owned admission and lifetime of one prepared child. */
export type WorkbenchPreparedChild = Readonly<{
  /** The commands the child's Release declares. */
  commands: readonly AppCommandDeclaration[];
  /** Connect the prepared App using the shared window callbacks and commands. */
  mount(options: WorkbenchChildMountOptions): Promise<WorkbenchChildSurface>;
  /** Release preparation and lease resources, including a failed mount. */
  dispose(): Promise<void>;
}>;

/** Host services retain their own Team, account, Gill and consent authority. */
export type WorkbenchHostServices = Pick<
  TeamWorkbenchHostHandle,
  | "team"
  | "computers"
  | "directory"
  | "requestGill"
  | "watchGillChanges"
  | "memberAvatar"
> &
  Readonly<{
    /** Offer host-owned desktop Settings for this currently admitted surface. */
    suggestDesktopSettings(surfaceId: string): Promise<void>;
    /** Release the mounted child or host-owned observations. */
    dispose(): void;
  }>;

/** Controls offered by the real embedding host, never grants lent by the App. */
export type WorkbenchHostControls = Readonly<{
  /** Implemented Settings categories; omission means the retained unrestricted controls. */
  sections?: readonly string[] | undefined;
  /** Validate a location against the Settings this host actually offers. */
  parseSettings(location: WhistleJsonValue): WhistleJsonValue;
  /** Open validated host-rendered Settings without racing dashboard focus. */
  openSettings(
    location: WhistleJsonValue,
    options: Readonly<{ restoreFocus: boolean }>,
  ): void;
  /** Notify when the host dialog has closed; return its unsubscribe action. */
  subscribeSettingsClosed(listener: () => void): () => void;
  /** Observe host Settings changes until the returned unsubscribe is called. */
  subscribeChanges(listener: () => void): () => void;
  /** Attach the dashboard arranger; return the host registration cleanup. */
  attachDesktopSettings(handler: WorkbenchDesktopSettings): () => void;
  /** Ask the person for the child's own access, never through the dashboard. */
  requestAppAccess(
    target: Readonly<{
      surfaceId: string;
      title: string;
      /** Current host-admitted window Computer, never an App request field. */
      computerId: string | null;
    }>,
    input: AppPermissionRequest,
  ): Promise<AppPermissionOutcome>;
}>;

/** Retained host warning identifiers; adapters own their diagnostic sink. */
export type WorkbenchWarningEvent =
  | "team_workbench_commands_failed"
  | "team_workbench_settings_notification_failed"
  | "team_workbench_focus_notification_failed";
/** Fields of a retained child/settings notification failure. */
export type WorkbenchWarningFields =
  | Readonly<{
      /** What went wrong. */
      cause: unknown;
    }>
  | Readonly<{
      /** Whether the failure came while updating or while disposing. */
      stage: "update" | "dispose";
      /** What went wrong. */
      cause: unknown;
    }>;

/** One workbench's child mechanics over host-owned admission and services. */
export type WorkbenchHostOptions = Readonly<{
  /** The browser window that hosts the workbench. */
  hostWindow: Window;
  /** Check identity and launch address against this host's installation scope. */
  resolveLaunch(input: WorkbenchChildLaunch): WorkbenchResolvedChild;
  /** Prepare the child using its own current grants and lease owner. */
  prepareChild(
    launch: WorkbenchResolvedChild["launch"],
    signal: AbortSignal,
    onDeliveryPending: () => void,
  ): Promise<WorkbenchPreparedChild>;
  /** The host's Team, account and Gill services. */
  services: WorkbenchHostServices;
  /** Report a mounted child's explicit selection to the embedding host. */
  reportAgentSessionSelection(
    windowId: string,
    selection: AgentSessionSelection | null,
  ): void;
  /** What the embedding host offers beyond App windows. */
  platform: Readonly<{
    /** The host's Settings controls. */
    controls: WorkbenchHostControls;
    /** List only destinations the host currently implements. */
    destinations(): Promise<readonly WorkbenchPlatformDestination[]>;
    /** Follow a destination that the shared host verified was offered. */
    open(id: string): void;
    /** Take the pending App-open handoff, if there is one. */
    takeAppOpenRequest: TeamWorkbenchHostHandle["takeAppOpenRequest"];
  }>;
  /** Surface retained callback failures through the host's diagnostic sink. */
  log(event: WorkbenchWarningEvent, fields: WorkbenchWarningFields): void;
}>;
