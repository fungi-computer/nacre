import * as Schema from "effect/Schema";
import {
  appDeclaredCommandSchema,
  appCallsSchema,
} from "@fungi.computer/puffball/app";
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
const appComputerOperationSchema = z.enum({
  /** List the Team's Computers. */
  "computer.list": "computer.list",
  /** Read a file on a Computer. */
  "computer.readFile": "computer.readFile",
  /** Write a file on a Computer. */
  "computer.writeFile": "computer.writeFile",
  /** Run a command on a Computer. */
  "computer.execute": "computer.execute",
});

const selectedComputerPermissionSchema = z.lazy(() =>
  z.strictObject({
    /** Marks a permission limited to selected Computers. */
    kind: z.literal("selected-computers"),
    /** The selected Computers and what the App may do on each. */
    computers: z.array(
      z.strictObject({
        /** The Computer the operations apply to. */
        computerId: z.string().min(1),
        /** The operations the App may request on that Computer. */
        operations: z.array(appComputerOperationSchema),
      }),
    ),
  }),
);
const allTeamComputersPermissionSchema = z.lazy(() =>
  z.strictObject({
    /** Marks a permission covering all of the Team's Computers. */
    kind: z.literal("all-team-computers"),
    /** The operations the App may request on any Team Computer. */
    operations: z.array(appComputerOperationSchema),
  }),
);
/** App Computer permissions limited to selected Computers or the Team's Computers. */
export const appComputerPermissionSchema = z.discriminatedUnion("kind", [
  selectedComputerPermissionSchema,
  allTeamComputersPermissionSchema,
]);
/** One operation an App may request for a Computer. */
export type AppComputerOperation = Extract<
  z.output<typeof appComputerPermissionSchema>,
  {
    /** The permission that covers all of the Team's Computers. */
    kind: "all-team-computers";
  }
>["operations"][number];
/** Decoded Computer permission scope attached to an App directory entry. */
export type AppComputerPermission = z.output<
  typeof appComputerPermissionSchema
>;

const agentDirectoryOperationSchema = z.enum({
  /** List the Team's agents. */
  "agent.list": "agent.list",
});
const agentSessionOperationSchema = z.enum({
  /** Read an agent's session. */
  "agent.read": "agent.read",
  /** Send a message in an agent's session. */
  "agent.send": "agent.send",
  /** Manage an agent's session. */
  "agent.manage": "agent.manage",
});
/** Agent directory and session operations an App may request from its host. */
export const appAgentPermissionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    /** Marks a permission covering all of the Team's agents. */
    kind: z.literal("all-team-agents"),
    /** What the App may do with the agent directory. */
    directoryOperations: z.array(agentDirectoryOperationSchema),
    /** What the App may do in any agent's session. */
    sessionOperations: z.array(agentSessionOperationSchema),
  }),
  z.strictObject({
    /** Marks a permission limited to selected agents. */
    kind: z.literal("selected-agents"),
    /** What the App may do with the agent directory. */
    directoryOperations: z.array(agentDirectoryOperationSchema),
    /** The selected agents and what the App may do in each one's session. */
    agents: z.array(
      z.strictObject({
        /** The agent the operations apply to. */
        agentId: z.string().min(1).max(256),
        /** What the App may do in that agent's session. */
        sessionOperations: z.array(agentSessionOperationSchema),
      }),
    ),
  }),
]);
/** Decoded Agent permission scope attached to an App directory entry. */
export type AppAgentPermission = z.output<typeof appAgentPermissionSchema>;

/** Whether an App may use language-model and media generation services. */
export const appGenerationPermissionsSchema = z.strictObject({
  /** Whether the App may use language-model generation. */
  llm: z.boolean(),
  /** Whether the App may use media generation. */
  media: z.boolean(),
});
/** Decoded generation permissions attached to an App directory entry. */
export type AppGenerationPermissions = z.output<
  typeof appGenerationPermissionsSchema
>;

/** Whether an App may browse, buy, or install free marketplace entries. */
export const appMarketplacePermissionsSchema = z.strictObject({
  /** Whether the App may browse marketplace entries. */
  browse: z.boolean(),
  /** Whether the App may buy marketplace entries. */
  purchase: z.boolean(),
  /** Whether the App may install free marketplace entries. */
  installFree: z.boolean(),
});
/** Decoded marketplace permissions attached to an App directory entry. */
export type AppMarketplacePermissions = z.output<
  typeof appMarketplacePermissionsSchema
>;

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
        /** The operation grants held for this App. */
        grants: z.array(
          z.strictObject({
            /** The operation that is granted. */
            operation: z.string().min(1),
            /** The resource the grant covers. */
            resourceId: z.string().min(1),
          }),
        ),
        /**
         * The App's Computer permission, or null or absent when it has none.
         */
        computerPermission: appComputerPermissionSchema.nullable().optional(),
        /** The App's generation permissions. */
        generationPermissions: appGenerationPermissionsSchema,
        /** The App's marketplace permissions. */
        marketplacePermissions: appMarketplacePermissionsSchema,
        /** The App's Agent permission. */
        agentPermission: appAgentPermissionSchema,
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
