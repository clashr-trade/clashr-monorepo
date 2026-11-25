import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarSpec, GeneratedAvatar } from '../components/terminal/avatar';

afterEach(() => vi.restoreAllMocks());

const render = (address: string) => renderToString(createElement(GeneratedAvatar, { address, symbol: 'TEST', size: 40 }));

describe('generated avatar hydration', () => {
  it('keeps gradient markup identical when JS runtimes round trigonometry differently', () => {
    // Angle 161 reproduces the tiny y1 difference visible in the hydration report.
    const address = '0x0072000000000000000000000000000000000000';
    expect(avatarSpec(address).angle).toBe(161);
    const serverMarkup = render(address);
    const originalSin = Math.sin;
    const originalCos = Math.cos;
    vi.spyOn(Math, 'sin').mockImplementation((angle) => originalSin(angle) + Number.EPSILON);
    vi.spyOn(Math, 'cos').mockImplementation((angle) => originalCos(angle) - Number.EPSILON);

    expect(render(address)).toBe(serverMarkup);
    expect(serverMarkup).toContain('background:linear-gradient(251deg,');
    expect(serverMarkup).not.toContain('linearGradient');
    expect(serverMarkup).not.toContain('url(#');
  });

  it('renders every address-derived angle without evaluating runtime trigonometry', () => {
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');
    for (let value = 0; value < 256; value++) {
      const address = `0x00${value.toString(16).padStart(2, '0')}${'0'.repeat(36)}`;
      const { angle } = avatarSpec(address);
      expect(render(address)).toContain(`background:linear-gradient(${(angle + 90) % 360}deg,`);
    }
    expect(sin).not.toHaveBeenCalled();
    expect(cos).not.toHaveBeenCalled();
  });
  it('does not depend on React tree IDs or reference another avatar instance',()=>{
    const element=createElement(GeneratedAvatar,{address:'0x1234',symbol:'TEST',size:40});
    const server=renderToString(element,{identifierPrefix:'server-tree-'});
    const client=renderToString(element,{identifierPrefix:'client-tree-'});
    expect(client).toBe(server);
    expect(server).not.toMatch(/\bid=|url\(#/);
    const duplicates=renderToString(createElement('div',null,element,element));
    expect(duplicates.match(/background:linear-gradient/g)).toHaveLength(2);
    expect(duplicates).not.toMatch(/\bid=|url\(#/);
  });
});
