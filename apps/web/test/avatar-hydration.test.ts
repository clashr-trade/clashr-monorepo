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
    expect(serverMarkup).toContain('gradientTransform="rotate(161 0.5 0.5)"');
    expect(serverMarkup).toContain('x1="0" y1="0.5" x2="1" y2="0.5"');
  });

  it('renders every address-derived angle without evaluating runtime trigonometry', () => {
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');
    for (let value = 0; value < 256; value++) {
      const address = `0x00${value.toString(16).padStart(2, '0')}${'0'.repeat(36)}`;
      const { angle } = avatarSpec(address);
      expect(render(address)).toContain(`gradientTransform="rotate(${angle} 0.5 0.5)"`);
    }
    expect(sin).not.toHaveBeenCalled();
    expect(cos).not.toHaveBeenCalled();
  });
});
