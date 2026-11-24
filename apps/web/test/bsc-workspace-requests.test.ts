import {describe,it,expect,vi,beforeEach} from 'vitest';

const mocks=vi.hoisted(()=>({
  detail:vi.fn(),info:vi.fn(),trades:vi.fn(),holders:vi.fn(),candles:vi.fn(),
}));
vi.mock('../lib/product',()=>({BNB_PRODUCT:true}));
vi.mock('../lib/flap-market',()=>({
  getBnbProductToken:mocks.detail,getFlapTokenInfo:mocks.info,
  getFlapTrades:mocks.trades,getFlapHolders:mocks.holders,
}));
vi.mock('../lib/bsc-public-market',()=>({getPublicBscToken:vi.fn(),getPublicBscCandles:mocks.candles}));
import {getBscTokenWorkspace} from '../lib/bsc-token-workspace';

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue({chainId:56,source:'flap',token:{decimals:18},pools:[]});
  mocks.info.mockResolvedValue({decimals:18,totalSupply:'1000000000000000000000'});
  mocks.holders.mockResolvedValue(null);
});

describe('Flap token workspace request budget',()=>{
  it('shares one activity request between candles, trade rows and concurrent workspace callers',async()=>{
    mocks.trades.mockResolvedValue([
      {id:'a',time:120,priceUsd:2,usd:10,tokens:5},
      {id:'b',time:140,priceUsd:3,usd:12,tokens:4},
    ]);
    const address='0x'+'71'.repeat(20);
    const [first,second]=await Promise.all([getBscTokenWorkspace(address),getBscTokenWorkspace(address)]);
    expect(second).toBe(first);
    expect(mocks.trades).toHaveBeenCalledTimes(1);
    expect(mocks.candles).not.toHaveBeenCalled();
    expect(first?.trades).toHaveLength(2);
    expect(first?.candles).toEqual([{time:120,open:2,high:3,low:2,close:3,volume:22}]);
  });
  it('retains the token when activity is unavailable without inventing candles or retrying twice',async()=>{
    mocks.trades.mockRejectedValue(new Error('Activity unavailable'));
    const workspace=await getBscTokenWorkspace('0x'+'72'.repeat(20));
    expect(workspace).toMatchObject({activity:'unavailable',trades:[],candles:[],decimals:18});
    expect(mocks.trades).toHaveBeenCalledTimes(1);
    expect(mocks.candles).not.toHaveBeenCalled();
  });
});
