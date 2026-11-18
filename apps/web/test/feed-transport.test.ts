import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../lib/product',()=>({BNB_PRODUCT:true}));
import {FeedClient} from '../lib/feed/client';

afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
describe('BNB HTTP feed transport',()=>{
  it('does not open a WebSocket for status subscribers or topics, and keeps snapshots refreshing',async()=>{
    vi.useFakeTimers();vi.stubGlobal('window',{});
    const socket=vi.fn();vi.stubGlobal('WebSocket',socket);
    const client=new FeedClient();
    const stopStatus=client.subscribeStatus(()=>{});
    let value=0;
    const snapshot=vi.fn(async()=>++value);
    const release=client.retain({topic:'token:test',initial:0,apply:s=>s,fetchSnapshot:snapshot});
    await vi.advanceTimersByTimeAsync(0);
    expect(client.view<number>('token:test')).toMatchObject({data:1,phase:'fallback'});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(client.view<number>('token:test')?.data).toBe(3);
    expect(client.getStatus()).toMatchObject({connected:false,protocol:null});
    expect(socket).not.toHaveBeenCalled();
    release();stopStatus();await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(client.view('token:test')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves initial snapshots and does not repeatedly abort slow polling requests',async()=>{
    vi.useFakeTimers();
    const client=new FeedClient('poll');
    let finish!:(value:number)=>void;
    let signal!:AbortSignal;
    const snapshot=vi.fn((s:AbortSignal)=>{signal=s;return new Promise<number>(resolve=>{finish=resolve;});});
    const release=client.retain({topic:'token:slow',initial:7,initialIsSnapshot:true,apply:s=>s,fetchSnapshot:snapshot});
    expect(snapshot).not.toHaveBeenCalled();
    expect(client.view<number>('token:slow')?.data).toBe(7);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(snapshot).toHaveBeenCalledTimes(1);expect(signal.aborted).toBe(false);
    finish(9);await vi.advanceTimersByTimeAsync(0);
    expect(client.view<number>('token:slow')?.data).toBe(9);
    release();await vi.advanceTimersByTimeAsync(5000);
    expect(signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
});
