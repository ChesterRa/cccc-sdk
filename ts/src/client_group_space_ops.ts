import type {
  GroupSpaceArtifactOptions,
  GroupSpaceBindOptions,
  GroupSpaceCapabilitiesOptions,
  GroupSpaceIngestOptions,
  GroupSpaceJobsOptions,
  GroupSpaceProviderAuthOptions,
  GroupSpaceProviderCredentialStatusOptions,
  GroupSpaceProviderCredentialUpdateOptions,
  GroupSpaceProviderHealthCheckOptions,
  GroupSpaceQueryOptions,
  GroupSpaceSourcesOptions,
  GroupSpaceSpacesOptions,
  GroupSpaceStatusOptions,
  GroupSpaceSyncOptions,
} from './types.js';

type ClientCall = (op: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;

type GroupSpaceClient = {
  call: ClientCall;
};

export interface GroupSpaceOps {
  groupSpaceStatus(options: GroupSpaceStatusOptions): Promise<Record<string, unknown>>;
  groupSpaceSpaces(options: GroupSpaceSpacesOptions): Promise<Record<string, unknown>>;
  groupSpaceCapabilities(options: GroupSpaceCapabilitiesOptions): Promise<Record<string, unknown>>;
  groupSpaceBind(options: GroupSpaceBindOptions): Promise<Record<string, unknown>>;
  groupSpaceIngest(options: GroupSpaceIngestOptions): Promise<Record<string, unknown>>;
  groupSpaceQuery(options: GroupSpaceQueryOptions): Promise<Record<string, unknown>>;
  groupSpaceSources(options: GroupSpaceSourcesOptions): Promise<Record<string, unknown>>;
  groupSpaceArtifact(options: GroupSpaceArtifactOptions): Promise<Record<string, unknown>>;
  groupSpaceJobs(options: GroupSpaceJobsOptions): Promise<Record<string, unknown>>;
  groupSpaceSync(options: GroupSpaceSyncOptions): Promise<Record<string, unknown>>;
  groupSpaceProviderCredentialStatus(options?: GroupSpaceProviderCredentialStatusOptions): Promise<Record<string, unknown>>;
  groupSpaceProviderCredentialUpdate(options?: GroupSpaceProviderCredentialUpdateOptions): Promise<Record<string, unknown>>;
  groupSpaceProviderHealthCheck(options?: GroupSpaceProviderHealthCheckOptions): Promise<Record<string, unknown>>;
  groupSpaceProviderAuth(options?: GroupSpaceProviderAuthOptions): Promise<Record<string, unknown>>;
}

const groupSpaceOps: GroupSpaceOps & ThisType<GroupSpaceClient> = {
  async groupSpaceStatus(options) {
    return this.call('group_space_status', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  },

  async groupSpaceSpaces(options) {
    return this.call('group_space_spaces', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  },

  async groupSpaceCapabilities(options) {
    return this.call('group_space_capabilities', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  },

  async groupSpaceBind(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'bind',
      by: options.by ?? 'user',
    };
    if (options.remoteSpaceId) args['remote_space_id'] = options.remoteSpaceId;
    return this.call('group_space_bind', args);
  },

  async groupSpaceIngest(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      kind: options.kind ?? 'context_sync',
      by: options.by ?? 'user',
    };
    if (options.payload) args['payload'] = options.payload;
    if (options.idempotencyKey) args['idempotency_key'] = options.idempotencyKey;
    return this.call('group_space_ingest', args);
  },

  async groupSpaceQuery(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      query: options.query,
    };
    if (options.options) args['options'] = options.options;
    return this.call('group_space_query', args);
  },

  async groupSpaceSources(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.sourceId) args['source_id'] = options.sourceId;
    if (options.newTitle) args['new_title'] = options.newTitle;
    return this.call('group_space_sources', args);
  },

  async groupSpaceArtifact(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.kind) args['kind'] = options.kind;
    if (options.options) args['options'] = options.options;
    if (options.wait !== undefined) args['wait'] = options.wait;
    if (options.saveToSpace !== undefined) args['save_to_space'] = options.saveToSpace;
    if (options.outputPath) args['output_path'] = options.outputPath;
    if (options.outputFormat) args['output_format'] = options.outputFormat;
    if (options.artifactId) args['artifact_id'] = options.artifactId;
    if (options.timeoutSeconds !== undefined) args['timeout_seconds'] = options.timeoutSeconds;
    if (options.initialInterval !== undefined) args['initial_interval'] = options.initialInterval;
    if (options.maxInterval !== undefined) args['max_interval'] = options.maxInterval;
    return this.call('group_space_artifact', args);
  },

  async groupSpaceJobs(options) {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.jobId) args['job_id'] = options.jobId;
    if (options.state) args['state'] = options.state;
    if (options.limit !== undefined) args['limit'] = options.limit;
    return this.call('group_space_jobs', args);
  },

  async groupSpaceSync(options) {
    return this.call('group_space_sync', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'status',
      force: options.force ?? false,
      by: options.by ?? 'user',
    });
  },

  async groupSpaceProviderCredentialStatus(options = {}) {
    return this.call('group_space_provider_credential_status', {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
    });
  },

  async groupSpaceProviderCredentialUpdate(options = {}) {
    const args: Record<string, unknown> = {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
      clear: options.clear ?? false,
    };
    if (options.authJson) args['auth_json'] = options.authJson;
    return this.call('group_space_provider_credential_update', args);
  },

  async groupSpaceProviderHealthCheck(options = {}) {
    return this.call('group_space_provider_health_check', {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
    });
  },

  async groupSpaceProviderAuth(options = {}) {
    const args: Record<string, unknown> = {
      provider: options.provider ?? 'notebooklm',
      action: options.action ?? 'status',
      by: options.by ?? 'user',
    };
    if (options.timeoutSeconds !== undefined) args['timeout_seconds'] = options.timeoutSeconds;
    return this.call('group_space_provider_auth', args);
  },
};

export function installGroupSpaceOps(proto: GroupSpaceClient & Partial<GroupSpaceOps>): void {
  Object.assign(proto, groupSpaceOps);
}
