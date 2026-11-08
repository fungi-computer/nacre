import { expect, it } from "vitest";
import { workbenchDirectorySchema } from "../src/workbench-directory.js";

const base = { apps: [], roles: {} };

it("accepts bounded installing entries with a typed reason", () => {
  const parsed = workbenchDirectorySchema.parse({
    ...base,
    installing: [
      { installationId: "prints", displayName: "Prints", state: "installing" },
      {
        installationId: "shed",
        displayName: "Shed",
        state: "needs-runtime",
      },
      {
        installationId: "grove",
        displayName: "Grove",
        state: "failed",
        reason: { code: "network", message: "The download stopped." },
      },
    ],
  });
  expect(parsed.installing).toHaveLength(3);
});

it.each([
  [{ installationId: "x", displayName: "X", state: "done" }],
  [
    {
      installationId: "x",
      displayName: "X",
      state: "failed",
      reason: { code: "nope", message: "no" },
    },
  ],
  [{ installationId: "x", displayName: "X", state: "installing", extra: 1 }],
])("rejects an entry outside the contract", (entry) => {
  expect(() =>
    workbenchDirectorySchema.parse({ ...base, installing: [entry] }),
  ).toThrow();
});

it("bounds the list", () => {
  const entries = Array.from({ length: 17 }, (_, index) => ({
    installationId: `app-${String(index)}`,
    displayName: "App",
    state: "installing" as const,
  }));
  expect(() =>
    workbenchDirectorySchema.parse({ ...base, installing: entries }),
  ).toThrow();
});
