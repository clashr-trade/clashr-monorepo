import {afterEach, expect, test, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../middleware';

afterEach(() => vi.unstubAllEnvs());

test('internal health probe is served without an HTTPS redirect', () => {
  vi.stubEnv('CLASHR_DEPLOYMENT', 'railway');
  const response = middleware(new NextRequest('http://healthcheck.railway.app/api/health'));
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
});

test('Railway HTTPS forwarding does not loop back to the same URL', () => {
  vi.stubEnv('CLASHR_DEPLOYMENT', 'railway');
  vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID', '56');
  const response = middleware(new NextRequest('http://frontend.up.railway.app/', {
    headers: {host: 'frontend.up.railway.app', 'x-forwarded-proto': 'https'},
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
});

test('Railway public HTTP still redirects to HTTPS', () => {
  vi.stubEnv('CLASHR_DEPLOYMENT', 'railway');
  vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID', '56');
  const response = middleware(new NextRequest('http://frontend.up.railway.app/', {
    headers: {host: 'frontend.up.railway.app', 'x-forwarded-proto': 'http'},
  }));
  expect(response.status).toBe(301);
  expect(response.headers.get('location')).toBe('https://frontend.up.railway.app/');
});
