export type ClientCall = (op: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type CCCC0430Client = {
  call: ClientCall;
};

export type GroupScopedOptions = {
  groupId?: string;
  by?: string;
};

export type BasicGroupActorOptions = {
  groupId: string;
  actorId: string;
  by?: string;
};

export function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
