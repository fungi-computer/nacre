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
