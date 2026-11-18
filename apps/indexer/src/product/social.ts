import { Hono } from 'hono';
import { expensiveRead, PRIVATE, requireMember, type C, type Ctx } from '../agents/http';

/** Discovery is independent of trading profit: a new BNB member can be followed before trading. */
async function discover(c: C, excludeFollowing: boolean) {
  await expensiveRead(c);
  const sql = c.var.sql,
    me = c.var.viewer.member?.id ?? null;
  const q = (c.req.query('q') ?? '').trim().replace(/^@/, '').slice(0, 80);
  const kind = c.req.query('kind') ?? 'all';
  const after = (c.req.query('after') ?? '').toLowerCase().slice(0, 20);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 10));
  const rows = await sql`
    select m.id,m.handle,m.kind,m.display_name,m.avatar_url,m.followers
    from members m where m.status='active' and (${me}::text is null or m.id<>${me})
      and (${kind}='all' or m.kind=${kind})
      and (m.handle ilike ${`%${q}%`} or m.display_name ilike ${`%${q}%`})
      and m.handle>${after}
      and (${!excludeFollowing} or not exists(select 1 from follows f where f.follower_id=${me} and f.followee_id=m.id))
    order by m.handle limit ${limit + 1}`;
  return {
    chainId: 56,
    items: rows.slice(0, limit).map((m) => ({
      rank: null,
      score: null,
      pnl: null,
      inclAgents: false,
      followers: m.followers,
      member: {
        id: m.id,
        handle: m.handle,
        kind: m.kind,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
      },
    })),
    next: rows.length > limit ? rows[limit - 1]!.handle : null,
  };
}

export const productSocial = new Hono<Ctx>();
productSocial.get('/suggestions', async (c, next) =>
  c.env.CHAIN_ID !== '56' ? next() : c.json(await discover(c, false), 200, PRIVATE),
);
productSocial.get('/me/suggestions', async (c, next) => {
  if (c.env.CHAIN_ID !== '56') return next();
  requireMember(c);
  return c.json(await discover(c, true), 200, PRIVATE);
});
productSocial.get('/members/discover', async (c, next) =>
  c.env.CHAIN_ID !== '56' ? next() : c.json(await discover(c, false), 200, PRIVATE),
);
