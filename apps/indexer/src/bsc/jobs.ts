export interface BscJob {
  version: 2;
  chainId: 56;
  kind: 'market-index';
  configHash: string;
  /** Scheduled minute: deterministic across delivery retries. */
  minute: number;
  step: number;
  executionId?: string;
}
export function parseBscJob(value: unknown): BscJob {
  if (!value || typeof value !== 'object') throw new Error('Invalid BSC job');
  const job = value as Record<string, unknown>;
  if (job.version !== 2 || job.chainId !== 56 || job.kind !== 'market-index'
    || typeof job.configHash !== 'string' || !/^[0-9a-f]{64}$/.test(job.configHash)
    || !Number.isSafeInteger(job.minute) || Number(job.minute) < 0
    || !Number.isInteger(job.step) || Number(job.step) < 0 || Number(job.step) > 19) throw new Error('Invalid BSC job identity');
  if(job.executionId!==undefined && (typeof job.executionId!=='string'||!/^local-[0-9a-f-]{36}$/.test(job.executionId)))throw new Error('Invalid local execution identity');
  return job as unknown as BscJob;
}
/** Untagged historical messages always mean 4663. No v2 job enters legacy SQL. */
export function isLegacyJob(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return (job.version === undefined || job.version === 1)
    && (job.chainId === undefined || job.chainId === 4663)
    && (job.chain_id === undefined || job.chain_id === 4663);
}
