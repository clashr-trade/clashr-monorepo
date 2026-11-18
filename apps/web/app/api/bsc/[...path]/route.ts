import { getCloudflareContext } from '@opennextjs/cloudflare';
import { proxyBscRead } from '../../../../lib/bsc-preview';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  let base = process.env.BSC_INDEXER_URL;
  try {
    const { env } = getCloudflareContext() as unknown as { env: { BSC_INDEXER_URL?: string } };
    base = env.BSC_INDEXER_URL ?? base;
  } catch { /* Next local runtime uses process.env. */ }
  return proxyBscRead((await params).path, base);
}
