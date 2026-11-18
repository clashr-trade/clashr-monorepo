// Requires a running app and an isolated headless Chrome with --remote-debugging-port=9223.
// No wallet interaction, personal browser profile, or application writes.
import assert from 'node:assert/strict';

const cdp = process.env.CDP_URL ?? 'http://127.0.0.1:9223';
const origin = process.env.HYDRATION_APP_URL ?? 'http://localhost:3000';
const target = await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(message.error);
    else request?.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  pending.set(next, { resolve, reject });
  socket.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reduce = value => call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
async function checkPage() {
  const deadline = Date.now() + 45_000;
  while (!await evaluate(`document.readyState === 'complete' && !!document.querySelector('#trenches') && !!document.querySelector('[data-landing-reveal]')`)) {
    assert(Date.now() < deadline, 'Landing page did not finish streaming');
    await sleep(250);
  }
  await sleep(2000); // Let hydration and delayed stream insertions finish.
  assert.deepEqual(errors, [], 'No hydration, streaming, or runtime errors expected');
  for (const section of ['social', 'leaderboard', 'agents', 'trenches', 'community']) {
    assert.equal(await evaluate(`document.querySelectorAll('main > #${section}').length`), 1, `${section} retains its section boundary`);
  }
}
async function checkReducedStyles() {
  assert(await evaluate(`[...document.querySelectorAll('[data-landing-reveal]')].every(element => {
    const style = getComputedStyle(element);
    return style.opacity === '1' && style.transform === 'none' && style.animationName === 'none';
  })`), 'All reveal content must be visible and stationary under reduced motion');
}
try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  for (const preference of ['no-preference', 'reduce']) {
    await reduce(preference);
    await call('Page.navigate', { url: `${origin}/` });
    await checkPage();
    if (preference === 'reduce') await checkReducedStyles();
    await call('Page.reload', { ignoreCache: true });
    await checkPage();
    if (preference === 'reduce') await checkReducedStyles();
  }
  await reduce('no-preference');
  await sleep(250);
  await reduce('reduce');
  await sleep(250);
  await checkReducedStyles();
  assert.deepEqual(errors, []);
  console.log('Landing hydration passed: normal/reduced motion, uncached loads/reloads, live preference changes, section boundaries, and reduced-motion visibility.');
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}
