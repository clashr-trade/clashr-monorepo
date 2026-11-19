import {describe,expect,it} from 'vitest';
import {clashrTokenAddress} from '../lib/clashr-token';

describe('CLASHR launch address',()=>{
  it('keeps the copy field unavailable without a real address',()=>{
    for(const value of [undefined,'','coming soon','0x123','0x0000000000000000000000000000000000000000'])expect(clashrTokenAddress(value)).toBeNull();
  });
  it('normalizes valid addresses and rejects incorrect mixed-case checksums',()=>{
    expect(clashrTokenAddress(' 0x52908400098527886e0f7030069857d2e4169ee7 ')).toBe('0x52908400098527886E0F7030069857D2E4169EE7');
    expect(clashrTokenAddress('0x52908400098527886E0F7030069857D2E4169Ee7')).toBeNull();
  });
});
