import { expect, test } from "vitest";
import { backBinding, forwardBinding, shellCommands } from "../src/commands.js";

const noop = () => undefined;
const base = {
  openApp: noop,
  showKeys: noop,
  showCommandLine: noop,
  focusStep: noop,
  swapStep: noop,
  toggleZoom: noop,
};

test("Forward is the leader chord that pairs with Back", () => {
  expect(backBinding).toBe("<leader>[");
  expect(forwardBinding).toBe("<leader>]");
  const commands = shellCommands({ ...base, back: noop, forward: noop });
  const bindings = (id: string) =>
    commands.find((command) => command.id === id)?.projections?.bindings
      ?.values;
  expect(bindings("back")).toEqual([backBinding, "cmd+["]);
  expect(bindings("forward")).toEqual([forwardBinding, "cmd+]"]);
});

test("a shell without history offers neither Back nor Forward", () => {
  const ids = shellCommands(base).map((command) => command.id);
  expect(ids).not.toContain("back");
  expect(ids).not.toContain("forward");
});
