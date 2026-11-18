import { getBscTokenWorkspace } from '../../../../../../lib/bsc-token-workspace';
export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-f]{40}$/i.test(address))
    return Response.json({ error: 'invalid_address' }, { status: 400 });
  try {
    const snapshot = await getBscTokenWorkspace(address);
    return snapshot
      ? Response.json(snapshot, { headers: { 'cache-control': 'no-store' } })
      : Response.json({ error: 'token_not_found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'bsc_token_unavailable' }, { status: 503 });
  }
}
