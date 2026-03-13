/**
 * CCCC SDK - TypeScript Client for CCCC Daemon (IPC v1)
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

// Export client class.
export { CCCCClient } from './client.js';

// Export error classes.
export {
  CCCCSDKError,
  DaemonAPIError,
  DaemonUnavailableError,
  IncompatibleDaemonError,
} from './errors.js';

// Export transport utility functions.
export {
  discoverEndpoint,
  defaultHome,
} from './transport.js';

// Export all types.
export type {
  // Core types.
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  DaemonErrorPayload,
  AddressDescriptor,
  // Event types.
  EventStreamItem,
  CCCSEvent,
  // Client options.
  CCCCClientOptions,
  CompatibilityOptions,
  // Operation argument types.
  SendOptions,
  SendCrossGroupOptions,
  ReplyOptions,
  ActorAddOptions,
  ActorUpdateOptions,
  ActorEnvPrivateUpdateOptions,
  ActorProfile,
  ActorProfileCapabilityDefaults,
  ActorProfileUsage,
  ActorProfileUpsertOptions,
  ActorProfileSecretUpdateOptions,
  ActorProfileSecretCopyFromActorOptions,
  ActorProfileSecretCopyFromProfileOptions,
  GroupCreateOptions,
  GroupUpdateOptions,
  CapabilityOverviewOptions,
  CapabilitySearchOptions,
  CapabilityEnableOptions,
  CapabilityBlockOptions,
  CapabilityStateOptions,
  CapabilityAllowlistMode,
  CapabilityAllowlistGetOptions,
  CapabilityAllowlistValidateOptions,
  CapabilityAllowlistUpdateOptions,
  CapabilityAllowlistResetOptions,
  CapabilityImportOptions,
  CapabilityUninstallOptions,
  CapabilityToolCallOptions,
  GroupSpaceProvider,
  GroupSpaceLane,
  GroupSpaceStatusOptions,
  GroupSpaceSpacesOptions,
  GroupSpaceCapabilitiesOptions,
  GroupSpaceBindOptions,
  GroupSpaceIngestOptions,
  GroupSpaceQueryOptions,
  GroupSpaceSourcesOptions,
  GroupSpaceArtifactOptions,
  GroupSpaceJobsOptions,
  GroupSpaceSyncOptions,
  GroupSpaceProviderCredentialStatusOptions,
  GroupSpaceProviderCredentialUpdateOptions,
  GroupSpaceProviderHealthCheckOptions,
  GroupSpaceProviderAuthOptions,
  AutomationNotifyPriority,
  AutomationTriggerInterval,
  AutomationTriggerCron,
  AutomationTriggerAt,
  AutomationTrigger,
  AutomationActionNotify,
  AutomationActionGroupState,
  AutomationActionActorControl,
  AutomationAction,
  AutomationRule,
  AutomationRuleSet,
  AutomationManageCreateRule,
  AutomationManageUpdateRule,
  AutomationManageSetRuleEnabled,
  AutomationManageDeleteRule,
  AutomationManageReplaceAllRules,
  AutomationManageAction,
  GroupAutomationUpdateOptions,
  GroupAutomationManageOptions,
  GroupAutomationResetBaselineOptions,
  InboxListOptions,
  ContextSyncOptions,
  EventsStreamOptions,
} from './types.js';

/** SDK version */
export const version = String(pkg.version || '0.0.0');
