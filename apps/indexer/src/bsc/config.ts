import { BSC_PANCAKE } from '@clashr/core/chain/pancake';

export interface BscEnv {
  BSC_INDEX_ENABLED?: string;
  BSC_INDEX_SOURCE?: string;
  BSC_RPC_URL?: string;
  BSC_START_BLOCK?: string;
  BSC_INDEX_EPOCH?: string;
  BSC_BATCH_BLOCKS?: string;
  DATABASE_URL?: string;
  ADMIN_TOKEN?: string;
  BSC_INDEX_QUEUE?: Queue;
}
export interface BscConfig { startBlock: bigint; batchBlocks: number; hash: string; source?: 'flap'; live?:boolean }
export async function bscConfig(env: BscEnv): Promise<BscConfig> {
  if (env.BSC_INDEX_ENABLED !== '1') throw new Error('BSC indexing disabled');
  if (!env.BSC_RPC_URL || !env.DATABASE_URL) throw new Error('Explicit BSC RPC and database required');
  if (!/^[1-9][0-9]{0,17}$/.test(env.BSC_START_BLOCK ?? '') || !/^[a-zA-Z0-9_-]{1,64}$/.test(env.BSC_INDEX_EPOCH ?? '')) throw new Error('Explicit BSC start block and epoch required');
  const batch = env.BSC_BATCH_BLOCKS ?? '20';
  if (!/^[1-9][0-9]?$/.test(batch) || Number(batch) > 50) throw new Error('BSC batch must contain 1..50 blocks');
  if(env.BSC_INDEX_SOURCE && env.BSC_INDEX_SOURCE!=='flap')throw new Error('Unsupported BSC source');
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, decoder: env.BSC_INDEX_SOURCE==='flap'?'flap-1':1, chain: BSC_PANCAKE, scope: env.BSC_INDEX_SOURCE==='flap'?'flap-portal':'wbnb-only',
    startBlock: env.BSC_START_BLOCK, epoch: env.BSC_INDEX_EPOCH }));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
  return { startBlock: BigInt(env.BSC_START_BLOCK!), batchBlocks: Number(batch), hash, ...(env.BSC_INDEX_SOURCE==='flap'?{source:'flap' as const}:{}) };
}
