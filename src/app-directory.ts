import * as Schema from "effect/Schema";
import {
  appCapabilityIdSchema,
  appDeclaredCommandSchema,
  type AppCapabilityId,
  appCallsSchema,
} from "@fungi.computer/puffball/app";
import { hostActorSchema } from "@fungi.computer/puffball/app-method-runtime";
import { sha256DigestSchema as effectSha256DigestSchema } from "@fungi.computer/puffball/effect";
import {
  appDeclaredGillSchema,
  appGillParamsSchema,
} from "@fungi.computer/gills";
import * as z from "zod";

/** An App address selects a host default or a specific installation. */
export const appAddressSchema = z.lazy(() =>
  z.union([
    z.strictObject({
      /** Marks an address that selects a host default App. */
      kind: z.literal("default"),
      /** The App whose host default is selected. */
      appId: z.string().min(1),
    }),
    z.strictObject({
      /** Marks an address that selects one installation. */
      kind: z.literal("installation"),
      /** The installation that is selected. */
      installationId: z.string().min(1),
    }),
  ]),
);

/** Host-reported progress of applying a revised App authority version. */
export const appAuthorityEnforcementSchema = z.lazy(() =>
  z.strictObject({
    /** The host's id for the authority change being applied. */
    requestId: z.string().min(1),
    /** The App address whose authority changed. */
    address: appAddressSchema,
    /** The authority version being applied. */
    authorityVersion: z.number().int().positive(),
    /** How far the change has progressed. */
    state: z.enum({
      /** The change needs no delivery. */
      unaffected: "unaffected",
      /** Some deliveries are still unconfirmed. */
      pending: "pending",
      /** Every delivery was confirmed. */
      applied: "applied",
      /** Nothing is outstanding, but not every delivery was confirmed. */
      expired: "expired",
    }),
    /** How many deliveries of the change are still unconfirmed. */
    outstanding: z.number().int().nonnegative(),
  }),
);

/** Decoded address of a default App or an installation. */
export type AppAddress = z.output<typeof appAddressSchema>;
/** Stable identity of one App address across directory and settings views. */
export const addressKey = (address: AppAddress) =>
  address.kind === "default"
    ? `default:${address.appId}`
    : `installation:${address.installationId}`;
/** A host-reported authority change and its remaining work. */
export type AppAuthorityEnforcement = z.output<
  typeof appAuthorityEnforcementSchema
>;

/**
 * A Release-declared Gill carried by the host's App directory. The named
 * mapped type keeps consumer declarations attached to this public contract.
 */
export type AppDirectoryGill = {
  [
    Field in keyof Schema.Schema.Type<typeof appDeclaredGillSchema>
  ]: Schema.Schema.Type<typeof appDeclaredGillSchema>[Field];
};

/** Reusable App metadata supplied by an embedding host; it conveys no permissions. */
export const appDirectoryEntrySchema = z.strictObject({
  /** The address that selects this App. */
  address: appAddressSchema,
  /** The installation this row describes, or null when it describes none. */
  installationId: z.string().min(1).nullable(),
  /** The id of the App surface this row opens. */
  surfaceId: z.string().min(1),
  /** The App's id. */
  appId: z.string().min(1),
  /** The name shown for the App. */
  displayName: z.string().trim().min(1).optional(),
  /** The App's icon, or null when it has none. */
  icon: z.string().min(1).nullable().optional(),
  /** The Release the row runs, or null when none is recorded. */
  releaseId: z.string().min(1).nullable(),
  /** The version of the App's authority. */
  authorityVersion: z.number().int().nonnegative(),
  /**
   * Progress of applying a revised authority version, or null when none is in
   * progress.
   */
  enforcement: appAuthorityEnforcementSchema.nullable(),
  /** The kinds of handler the App offers, such as file.open. */
  handlers: z.array(z.literal("file.open")),
  /** The roles the App can fill. */
  roles: z.array(z.string().min(1)),
  /** Capabilities the Release declares: the ceiling for host consent, never a grant. */
  declaredCapabilities: z.array(z.string().min(1)),
  /** The calls the App's Release declares. */
  calls: z
    .unknown()
    .transform((value) => Schema.decodeUnknownSync(appCallsSchema)(value))
    .optional(),
  /** The commands the App's Release declares. */
  commands: z
    .array(z.unknown())
    .transform((values) =>
      values.map((value) =>
        Schema.decodeUnknownSync(appDeclaredCommandSchema)(value),
      ),
    ),
  /** The Gills the App's Release declares. */
  gills: z.array(z.unknown()).transform((values): AppDirectoryGill[] =>
    values.map((value) =>
      Schema.decodeUnknownSync(appDeclaredGillSchema, {
        onExcessProperty: "error",
      })(value),
    ),
  ),
  /** Whether the App can be opened now. */
  availability: z.enum({
    /** The App can be opened. */
    available: "available",
    /** The App cannot be opened now. */
    unavailable: "unavailable",
  }),
  /** The App's surface, or null when it has none. */
  surface: z
    .strictObject({
      /** The route that identifies the surface across Releases. */
      stableRoute: z.string().min(1),
    })
    .nullable(),
  /** The path, starting with a slash, where the surface is served. */
  surfacePath: z.string().startsWith("/"),
});
/** An App directory row before host-specific permissions are attached. */
export type AppDirectoryEntry = z.output<typeof appDirectoryEntrySchema>;
/** A host-resolved role selection; a surface address is not launch authority. */
export const appRoleSelectionSchema = z.strictObject({
  /** The surface selected for the role, or null when none is. */
  surfaceId: z.string().min(1).nullable(),
  /** Whether an App is selected for the role. */
  chosen: z.boolean(),
});
const sha256DigestSchema = z.custom<typeof effectSha256DigestSchema.Type>(
  Schema.is(effectSha256DigestSchema),
);
const capabilityIdSchema = z.custom<AppCapabilityId>(
  Schema.is(appCapabilityIdSchema),
);
const approvalVersionSchema = z.number().int().positive();
const operationNamesSchema = z
  .array(z.string().min(1))
  .refine(
    (values) => new Set(values).size === values.length,
    "Operations must be unique",
  )
  .readonly();
const operationFingerprintsSchema = z
  .record(z.string().min(1), z.string().min(1))
  .readonly();

/** One resource, such as a Computer or an Agent, that an approval is limited to. */
const approvedResourceSchema = z
  .strictObject({
    /** What kind of resource this is, such as a Computer or an Agent. */
    kind: z.string().min(1),
    /** The host's id for the resource. */
    id: z.string().min(1),
  })
  .readonly();

/**
 * One capability the Team approved, with the operations and resources it
 * covers.
 */
const approvedGrantSchema = z
  .strictObject({
    /** The capability the Team approved. */
    capability: capabilityIdSchema,
    /** Always true: only an approval is ever stored. */
    capabilityApproved: z.literal(true),
    /** The operations the approval covers. */
    operations: operationNamesSchema,
    /** What each approved operation did when the Team approved it. */
    fingerprints: operationFingerprintsSchema,
    /** Every resource of the Team ("tenant-scope"), or only the named ones. */
    resources: z.union([
      z.literal("tenant-scope"),
      z.array(approvedResourceSchema).readonly(),
    ]),
  })
  .readonly();

/** What the Team has approved for one App, as the host stores it. */
const appAuthoritySchema = z.strictObject({
  /** Counts each change to the approvals; a save names the version it read. */
  authorityVersion: z.number().int().positive(),
  /** Digest of the declared operations the approvals were made against. */
  declaredOperationsDigest: sha256DigestSchema,
  /** The approvals, one per capability. */
  approvedGrants: z
    .array(approvedGrantSchema)
    .refine(
      (grants) =>
        new Set(grants.map((grant) => grant.capability)).size === grants.length,
      "Capabilities must be unique",
    )
    .refine(
      (grants) =>
        grants.every((grant) => {
          const names = Object.keys(grant.fingerprints);
          return (
            names.length === grant.operations.length &&
            grant.operations.every((operation) => names.includes(operation))
          );
        }),
      "Every approved operation needs exactly one fingerprint",
    )
    .readonly(),
  /** Who approved and when, or null when nothing was approved yet. */
  approval: z
    .strictObject({
      /** The member, Agent or Team key that approved. */
      by: hostActorSchema,
      /** When the approval was made, in epoch milliseconds. */
      at: z.number().int().nonnegative(),
      /** The authority version the approval produced. */
      authorityVersion: approvalVersionSchema,
    })
    .readonly()
    .nullable(),
});

/** What the selected Release can do, derived from the host's descriptors. */
const declaredOperationsSchema = z.strictObject({
  /** Digest of the artifact these operations were derived from. */
  artifactDigest: sha256DigestSchema,
  /** Digest of the whole declared set; a save names the digest it read. */
  digest: sha256DigestSchema,
  /** The capabilities the Release declares and the operations each offers. */
  capabilities: z
    .array(
      z
        .strictObject({
          /** The capability the Release declares. */
          capability: capabilityIdSchema,
          /** The operations the capability offers this Release. */
          operations: operationNamesSchema,
          /** What each operation does. */
          fingerprints: operationFingerprintsSchema,
        })
        .readonly(),
    )
    .readonly(),
});

/**
 * What one App row says about permissions: the Team's stored approvals (null
 * when no installation exists yet), the Release's declared operations, the
 * artifact digest and whether the viewer may edit. A save pins the artifact
 * digest and the declared-operations digest from here.
 */
export const appPermissionFactsSchema = z.strictObject({
  /** The Team's stored approvals, or null when the App is not installed yet. */
  authority: appAuthoritySchema.nullable(),
  /** What the selected Release can do. */
  declaredOperations: declaredOperationsSchema,
  /** Digest of the artifact the declared operations describe. */
  artifactDigest: sha256DigestSchema,
  /** Whether the person reading the row may change its permissions. */
  canEdit: z.boolean(),
});
/** Decoded permission facts attached to an App directory row. */
export type AppPermissionFacts = z.output<typeof appPermissionFactsSchema>;

/**
 * A host's Team App directory with its permission projection, parsed strictly
 * by every consumer: an unknown field is a contract change both sides make.
 */
export const appDirectoryResponseSchema = z.lazy(() =>
  z.strictObject({
    /** Whether the person asking owns the Team. */
    actorIsTeamOwner: z.boolean(),
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
    /** The Team's App rows with their permissions. */
    apps: z.array(
      appDirectoryEntrySchema.extend({
        /**
         * The Release and surface route the Team has set for this App, or null when none.
         */
        override: z
          .strictObject({
            /** The App the override names. */
            appId: z.string().min(1).optional(),
            /** The Release the override pins. */
            releaseId: z.string().min(1),
            /**
             * The surface route the override pins, or null when it pins none.
             */
            surfaceRoute: z.string().min(1).nullable(),
          })
          .nullable(),
        /**
         * The App's permission facts, or null when its Release cannot be
         * resolved now: nothing is shown and nothing is edited from a guess.
         */
        permission: appPermissionFactsSchema.nullable(),
      }),
    ),
    /** The Team's effective App per role, owned and resolved by the host. */
    roles: z.record(z.string().min(1), appRoleSelectionSchema),
  }),
);

/** The host-resolved Team App directory and its permission projections. */
export type AppDirectory = z.output<typeof appDirectoryResponseSchema>;

/** Desktop metadata is a method result, distinct from the full Release Gill declaration. */
const catalogGillParamsSchema = z.lazy(() =>
  z
    .array(
      z.strictObject({
        /** The parameter's key. */
        key: z.string().max(64),
        /** The label shown for the parameter. */
        label: z.string().max(256),
        /** What the parameter picks: a Computer, a repository or a branch. */
        kind: z.enum(["computer", "repository", "branch"]),
        /** Whether the Gill cannot be placed without it. */
        required: z.boolean(),
        /** Extra options for the parameter. */
        options: z.string().max(256).optional(),
      }),
    )
    .max(4)
    // The wire shape is representable; Gill owns its domain refinements.
    .refine(
      Schema.is(appGillParamsSchema),
      "Invalid Gill placement parameters",
    ),
);
const catalogGillSchema = z.strictObject({
  /** The Gill's id. */
  id: z.string().trim().min(1).max(256),
  /** The name shown for the Gill. */
  title: z.string().trim().min(1).max(256),
  /** Placement parameters the Gill asks for. */
  params: catalogGillParamsSchema.optional(),
  /** How the Gill may appear on the dashboard. */
  desktop: z
    .strictObject({
      /** Layout sizes the Gill supports. */
      sizes: z
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
        .min(1)
        .max(3)
        .refine(
          (sizes) => new Set(sizes).size === sizes.length,
          "Repeated Gill size",
        ),
    })
    .optional(),
});
/** Read-only catalog metadata for one App, without host-specific role policy. */
export const appCatalogEntrySchema = appDirectoryEntrySchema
  .pick({
    surfaceId: true,
    appId: true,
    displayName: true,
  })
  .extend({
    /** The Gills the App declares for the desktop. */
    gills: z.array(catalogGillSchema).max(16),
  });

/** Read-only desktop metadata; identities are surface addresses, never launch authority. */
export const appCatalogResponseSchema = z.lazy(() =>
  z.strictObject({
    /** The Apps in the catalog. */
    apps: z.array(appCatalogEntrySchema).max(50),
    /** The role selections the catalog reports. */
    roles: z.strictObject({
      /** The selection for the inbox role, when there is one. */
      inbox: appRoleSelectionSchema.optional(),
    }),
  }),
);
/** Parsed metadata returned by the read-only APPS.catalog binding. */
export type AppCatalog = z.output<typeof appCatalogResponseSchema>;

/** Complete APPS.catalog reply, including broker admission failures. */
export const appCatalogBrokerResultSchema = z.lazy(() =>
  z.union([
    appCatalogResponseSchema,
    z.strictObject({
      /** Why the broker refused the catalog request. */
      error: z.string(),
    }),
  ]),
);

const methodLabels = new Map([
  ["files.tree", "browse files"],
  ["files.list", "list files"],
  ["files.read", "read files"],
  ["commits.list", "read commits"],
  ["rebuildCopies", "refresh file views"],
  ["files.save", "save files"],
  ["files.sync", "sync files"],
  ["files.discard", "discard edits"],
]);

/** Shared readable copy for a declared method; authority keeps its exact key. */
export function appCallMethodLabel(method: string): string {
  const known = methodLabels.get(method);
  if (known !== undefined) return known;
  return method
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[._-]+/gu, " ")
    .trim()
    .toLowerCase();
}
