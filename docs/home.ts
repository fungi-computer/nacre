import { createWindowManager } from "@fungi.computer/nacre";

const windows = createWindowManager({
  createContainer: () => ({}),
  mount: () => ({
    setVisibility: () => undefined,
    reconfigure: () => undefined,
    dispose: () => undefined,
  }),
});
await windows.open({ windowId: "notes" });
console.log(windows.read().windows[0]?.status); // ready
