import { installCCCC0430AdminOps, type CCCC0430AdminOps } from './client_0430_admin_ops.js';
import { installCCCC0430AssistantOps, type CCCC0430AssistantOps } from './client_0430_assistant_ops.js';
import { installCCCC0430MemoryOps, type CCCC0430MemoryOps } from './client_0430_memory_ops.js';
import { installCCCC0430RuntimeOps, type CCCC0430RuntimeOps } from './client_0430_runtime_ops.js';
import type { CCCC0430Client } from './client_0430_shared.js';

export interface CCCC0430Ops
  extends CCCC0430AdminOps, CCCC0430AssistantOps, CCCC0430MemoryOps, CCCC0430RuntimeOps {}

export function installCCCC0430Ops(proto: CCCC0430Client & Partial<CCCC0430Ops>): void {
  installCCCC0430AdminOps(proto);
  installCCCC0430AssistantOps(proto);
  installCCCC0430MemoryOps(proto);
  installCCCC0430RuntimeOps(proto);
}
