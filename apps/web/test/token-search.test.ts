import {describe,it,expect} from 'vitest';
import {normalizeTokenQuery} from '../lib/search';

describe('token picker input',()=>{
  it('accepts the dollar-prefixed symbol advertised by the composer',()=>{
    expect(normalizeTokenQuery(' $SDF ')).toBe('SDF');
    expect(normalizeTokenQuery('$$ sdf')).toBe('sdf');
    expect(normalizeTokenQuery('$')).toBe('');
  });
  it('preserves contract addresses and token names',()=>{
    const address='0x'+'ab'.repeat(20);
    expect(normalizeTokenQuery(address)).toBe(address);
    expect(normalizeTokenQuery('  Sample Token  ')).toBe('Sample Token');
  });
});
