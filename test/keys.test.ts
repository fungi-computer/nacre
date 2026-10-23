import { expect, test } from "vitest";
import { createAppSurfaceCommandHost } from "../src/command-host.js";
import { leaderKeys, parseChord } from "../src/keys.js";

test.each([
  ["alt+x", false, { alt: true }],
  ["option+x", false, { alt: true }],
  ["ctrl+x", false, { ctrl: true }],
  ["control+x", false, { ctrl: true }],
  ["super+x", false, { meta: true }],
  ["meta+x", false, { meta: true }],
  ["cmd+x", false, { meta: true }],
  ["shift+x", false, { shift: true }],
  ["mod+x", false, { ctrl: true }],
  ["mod+x", true, { meta: true }],
  ["CTRL+Option+Shift+x", false, { ctrl: true, alt: true, shift: true }],
] satisfies [string, boolean, Record<string, boolean>][])(
  "normalizes %s (mac=%s) without changing other modifier facts",
  (binding, mac, modifiers) => {
    expect(parseChord(binding, mac)).toEqual({
      key: "x",
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
      ...modifiers,
    });
  },
);

test.each(["<leader>gx", "ctrl+k x", "unknown+x", "ctrl+", ""])(
  "refuses a non-chord %s",
  (binding) => {
    expect(parseChord(binding, false)).toBeNull();
  },
);

test("leader rows admit one logical key, including space and composed Unicode, not a continuation", () => {
  const host = createAppSurfaceCommandHost();
  const keys = ["z", " ", "é", "👩‍💻", "gx", "<leader>", ""];
  try {
    host.registerShellCommands(
      keys.map((key, index) => ({
        id: `key-${String(index)}`,
        title: `Key ${String(index)}`,
        category: "Keys",
        projections: { bindings: { values: [`<leader>${key}`] } },
        handler: () => undefined,
      })),
    );
    expect(leaderKeys(host.active()).map((row) => row.key)).toEqual([
      "z",
      " ",
      "é",
      "👩‍💻",
    ]);
  } finally {
    host.dispose();
  }
});
