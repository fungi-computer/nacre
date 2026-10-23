import {
  WorkbenchHost,
  type WorkbenchHostOptions,
  type TeamWorkbenchHostHandle,
} from "@fungi.computer/nacre/workbench";
import {
  createWindowManager,
  createAppSurfaceCommandHost,
} from "@fungi.computer/nacre";
import { parseChord } from "@fungi.computer/nacre/keys";
import { appDirectoryEntrySchema } from "@fungi.computer/nacre/app-directory";
export const createShellWindows: typeof createWindowManager =
  createWindowManager;
export const createShellCommands: typeof createAppSurfaceCommandHost =
  createAppSurfaceCommandHost;
export const shellChord = parseChord("mod+k", false);
export const shellDirectory = appDirectoryEntrySchema;

declare const workbenchOptions: WorkbenchHostOptions;
const workbenchHost: TeamWorkbenchHostHandle = new WorkbenchHost(
  workbenchOptions,
);
void workbenchHost;
