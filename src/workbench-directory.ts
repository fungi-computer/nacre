import * as z from "zod";
import {
  appDirectoryEntrySchema,
  appRoleSelectionSchema,
  appComputerPermissionSchema,
} from "./app-directory.js";
import { teamComputerSchema } from "./workbench-model.js";

const computerChoiceSchema = teamComputerSchema
  .pick({ computerId: true, name: true })
  .strip();

/** The shell picker needs identities and labels, not inventory receipts. */
export const workbenchComputerDirectorySchema = z.object({
  /** Computer identities and labels offered on this picker page. */
  computers: z.array(computerChoiceSchema),
  /** Offset of the next picker page, or null when this is the last page. */
  nextOffset: z.number().int().nonnegative().nullable(),
});

/** Why a starter App is not usable yet: a short code plus a plain message. */
export const installingReasonSchema = z.strictObject({
  /** The kind of failure: a build, the network, an unsupported host, or unknown. */
  code: z.enum({
    /** The App's build did not finish. */
    build_failed: "build_failed",
    /** The network stopped the download. */
    network: "network",
    /** This host cannot run the App. */
    unsupported: "unsupported",
    /** The cause is not known. */
    unknown: "unknown",
  }),
  /** One plain sentence a person can read. */
  message: z.string().min(1).max(200),
});

/** One starter App a trial is still setting up, or could not set up. */
export const installingAppSchema = z.strictObject({
  /** The installation this entry describes. */
  installationId: z.string().min(1).max(64),
  /** The name shown for the App. */
  displayName: z.string().min(1).max(64),
  /** The App's id, so other screens can name it while it is not yet installed. */
  appId: z.string().min(1).max(64).optional(),
  /** `needs-runtime` is installed but needs a Computer runtime the trial lacks. */
  state: z.enum({
    /** The App is being built and installed. */
    installing: "installing",
    /** The App could not be installed. */
    failed: "failed",
    /** The App is installed but needs a Computer runtime the trial lacks. */
    "needs-runtime": "needs-runtime",
  }),
  /** Why it failed or needs a runtime. */
  reason: installingReasonSchema.optional(),
});
/** One entry of the trial's starter-App list. */
export type InstallingApp = z.output<typeof installingAppSchema>;

/** Desktop metadata shared by hosts; hosted administration stays in Settings. */
export const workbenchDirectorySchema = z
  .object({
    /** The App rows the dashboard shows. */
    apps: z.array(
      appDirectoryEntrySchema
        .extend({
          /** Fixed context or an explicitly owner-admitted fleet, not a Team grant. */
          computer: z
            .union([computerChoiceSchema, z.literal("owner-fleet")])
            .optional(),
          /**
           * The row's Computer permission, or null or absent when it has none.
           */
          computerPermission: appComputerPermissionSchema.nullable().optional(),
        })
        .strip(),
    ),
    /** Default or fixed context, not a Team Computer permission or capability grant. */
    computer: computerChoiceSchema.optional(),
    /** Only an owner-admitted host may offer its fleet as window context.
     * This is not an App capability or a fabricated Team Computer grant. */
    computerContext: z.literal("owner-fleet").optional(),
    /** The App selected for each role. */
    roles: z.record(z.string().min(1), appRoleSelectionSchema),
    /** Directory records the host rejected. Each carries identity only, never launch authority. */
    needsUpdate: z
      .array(
        z.strictObject({
          /** The rejected record's installation, or null when it has none. */
          installationId: z.string().min(1).nullable(),
          /** The rejected record's App, or null when unknown. */
          appId: z.string().min(1).nullable(),
          /** The name shown for the rejected record. */
          displayName: z.string().min(1),
        }),
      )
      .optional(),
    /** Starter Apps a trial is still installing or could not install; entries clear once installed. */
    installing: z.array(installingAppSchema).max(16).optional(),
  })
  .transform((directory) =>
    directory.computerContext === "owner-fleet"
      ? {
          ...directory,
          apps: directory.apps.map((app) => ({
            ...app,
            computer: "owner-fleet" as const,
          })),
        }
      : directory.computer === undefined
        ? directory
        : {
            ...directory,
            apps: directory.apps.map((app) => ({
              ...app,
              computer: directory.computer,
            })),
          },
  );
/** One host's current desktop rows and actual role selections. */
export type WorkbenchDirectory = z.output<typeof workbenchDirectorySchema>;
