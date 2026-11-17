import { expect, it } from "vitest";
import {
  appDirectoryResponseSchema,
  appPermissionFactsSchema,
} from "../src/app-directory.js";
import { workbenchDirectorySchema } from "../src/workbench-directory.js";

const digest = `sha256:${"a".repeat(64)}`;
const otherDigest = `sha256:${"b".repeat(64)}`;

const facts = {
  authority: {
    authorityVersion: 3,
    declaredOperationsDigest: otherDigest,
    approvedGrants: [
      {
        capability: "computer.readFile",
        capabilityApproved: true,
        operations: ["computer.readFile"],
        fingerprints: { "computer.readFile": "read" },
        resources: [{ kind: "computer", id: "c1" }],
      },
      {
        capability: "agent.list",
        capabilityApproved: true,
        operations: ["agent.list"],
        fingerprints: { "agent.list": "list" },
        resources: "tenant-scope",
      },
    ],
    approval: {
      by: { kind: "member", memberId: "member_owner" },
      at: 1_700_000_000_000,
      authorityVersion: 3,
    },
  },
  declaredOperations: {
    artifactDigest: digest,
    digest: otherDigest,
    capabilities: [
      {
        capability: "computer.readFile",
        operations: ["computer.readFile"],
        fingerprints: { "computer.readFile": "read" },
      },
    ],
  },
  artifactDigest: digest,
  canEdit: true,
};

const row = {
  address: { kind: "default", appId: "app_grove" },
  installationId: null,
  surfaceId: "default:app_grove",
  appId: "app_grove",
  displayName: "Grove",
  icon: null,
  releaseId: null,
  override: null,
  permission: facts,
  authorityVersion: 3,
  enforcement: null,
  handlers: [],
  roles: [],
  declaredCapabilities: [],
  commands: [],
  gills: [],
  availability: "available",
  surface: null,
  surfacePath: "/api/teams/team_demo/apps/default/app_grove/surface",
};

const directory = <Row extends Partial<typeof row> | { permission: null }>(
  app: Row,
) => ({
  actorIsTeamOwner: true,
  apps: [app],
  roles: {},
});

it("accepts exactly the row that carries permission facts", () => {
  const parsed = appDirectoryResponseSchema.parse(directory(row));
  expect(parsed.apps[0]?.permission).toEqual(facts);
  expect(
    appDirectoryResponseSchema.parse(directory({ ...row, permission: null }))
      .apps[0]?.permission,
  ).toBeNull();
});

it("refuses the superseded permission fields and a row without facts", () => {
  for (const old of [
    { grants: [] },
    { computerPermission: null },
    { generationPermissions: { llm: false, media: false } },
    { marketplacePermissions: { browse: false, purchase: false } },
    {
      agentPermission: {
        kind: "all-team-agents",
        directoryOperations: [],
        sessionOperations: [],
      },
    },
  ])
    expect(
      appDirectoryResponseSchema.safeParse(directory({ ...row, ...old }))
        .success,
    ).toBe(false);
  const withoutFacts: Partial<typeof row> = { ...row };
  delete withoutFacts.permission;
  expect(
    appDirectoryResponseSchema.safeParse(directory(withoutFacts)).success,
  ).toBe(false);
});

it("refuses facts the host would never store", () => {
  const refuses = (changed: unknown) => {
    expect(appPermissionFactsSchema.safeParse(changed).success).toBe(false);
  };
  refuses({ ...facts, extra: true });
  refuses({ ...facts, artifactDigest: "sha256:short" });
  refuses({
    ...facts,
    authority: {
      ...facts.authority,
      approvedGrants: [
        ...facts.authority.approvedGrants,
        facts.authority.approvedGrants[0],
      ],
    },
  });
  refuses({
    ...facts,
    authority: {
      ...facts.authority,
      approvedGrants: [
        {
          ...facts.authority.approvedGrants[0],
          fingerprints: {},
        },
      ],
    },
  });
  refuses({
    ...facts,
    authority: {
      ...facts.authority,
      approvedGrants: [
        { ...facts.authority.approvedGrants[0], capabilityApproved: false },
      ],
    },
  });
  refuses({
    ...facts,
    authority: {
      ...facts.authority,
      approvedGrants: [
        {
          ...facts.authority.approvedGrants[0],
          capability: "not.a.capability",
        },
      ],
    },
  });
  expect(
    appPermissionFactsSchema.safeParse({ ...facts, authority: null }).success,
  ).toBe(true);
});

it("lets a workbench row carry facts or none, and refuses the old policy", () => {
  const bare: Partial<typeof row> = { ...row };
  delete bare.permission;
  const parsed = workbenchDirectorySchema.parse({
    apps: [row, bare],
    roles: {},
  });
  expect(parsed.apps.map((app) => app.permission)).toEqual([facts, undefined]);
  expect(
    workbenchDirectorySchema.parse({
      apps: [{ ...bare, computerPermission: null }],
      roles: {},
    }).apps[0],
  ).not.toHaveProperty("computerPermission");
});
