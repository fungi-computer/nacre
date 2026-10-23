/** Client-side tools for embedding and arranging Apps in a host-owned shell. */
export * from "./workbench.js";
export * from "./command-host.js";
export * from "./keys.js";
export * from "./commands.js";
export * from "./window-manager.js";
// The shell entry exposes metadata, not the host's Team-directory policy wire.
export {
  addressKey,
  appAddressSchema,
  appAuthorityEnforcementSchema,
  appCatalogBrokerResultSchema,
  appCatalogEntrySchema,
  appCatalogResponseSchema,
  appDirectoryEntrySchema,
  appRoleSelectionSchema,
  type AppAddress,
  type AppAuthorityEnforcement,
  type AppCatalog,
  type AppDirectoryEntry,
  type AppDirectoryGill,
} from "./app-directory.js";
export { createBrowserActionHandler } from "./browser-actions.js";
