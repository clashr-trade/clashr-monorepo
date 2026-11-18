import {Hono} from 'hono';
import {db,isAddr,type Ctx} from '../agents/http';
import {walletPnl} from '../data';
import {walletHoldings,walletPosition,page} from '../wallets';
import {PNL_RANGES,walletPnlHistory,walletTrades,type PnlRange} from '../wallet-history';
export const productWallets=new Hono<Ctx>();
productWallets.use('/wallets/*',db);
productWallets.use('/wallets/:wallet/*',async(c,next)=>{
  if(!isAddr(c.req.param('wallet').toLowerCase()))return c.json({error:'invalid_wallet'},400);await next();
});
productWallets.get('/wallets/:wallet/pnl',async c=>c.json(await walletPnl(c.var.sql,c.req.param('wallet').toLowerCase(),page(k=>c.req.query(k)))));
productWallets.get('/wallets/:wallet/pnl/history',async c=>{
  const range=(c.req.query('range')??'7d') as PnlRange;if(!PNL_RANGES.includes(range))return c.json({error:'invalid_range'},400);
  return c.json(await walletPnlHistory(c.var.sql,c.req.param('wallet').toLowerCase(),range));
});
productWallets.get('/wallets/:wallet/trades',async c=>c.json(await walletTrades(c.var.sql,c.req.param('wallet').toLowerCase(),{limit:Math.max(1,Math.min(200,Number(c.req.query('limit'))||50)),before:Number(c.req.query('before'))||null})));
productWallets.get('/wallets/:wallet/holdings',async c=>c.json(await walletHoldings(c.var.sql,c.req.param('wallet').toLowerCase(),page(k=>c.req.query(k),200))));
productWallets.get('/wallets/:wallet/positions/:token',async c=>{
  const token=c.req.param('token').toLowerCase();if(!isAddr(token))return c.json({error:'invalid_token'},400);
  const position=await walletPosition(c.var.sql,c.req.param('wallet').toLowerCase(),token);
  return position?c.json(position):c.json({error:'not_found'},404);
});
