import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAP_ABI, FLAP_PORTAL } from '../../packages/trade/src/bsc/flap.ts';

// Run with the trade package's tsx loader after the default Foundry build.
// Compare compiler output, not a second hand-maintained ABI fixture.
const artifactUrl = new URL('../out/flap/IFlapPortal.sol/IFlapPortal.json', import.meta.url);
const artifact = JSON.parse(readFileSync(artifactUrl, 'utf8'));
const constants = readFileSync(new URL('../src/flap/FlapBNB.sol', import.meta.url), 'utf8');
const portal = /\bPORTAL\s*=\s*(0x[0-9a-fA-F]{40})\s*;/.exec(constants)?.[1];
assert.equal(portal?.toLowerCase(), FLAP_PORTAL.toLowerCase(), 'BNB Portal differs from the trade SDK');

const parameter = (item, event = false) => ({
  name: item.name ?? '',
  type: item.type,
  ...(item.components ? { components: item.components.map((component) => parameter(component)) } : {}),
  ...(event ? { indexed: item.indexed ?? false } : {}),
});
const normalize = (item) => ({
  type: item.type,
  name: item.name,
  inputs: item.inputs.map((input) => parameter(input, item.type === 'event')),
  ...(item.type === 'function'
    ? { outputs: item.outputs.map((output) => parameter(output)), stateMutability: item.stateMutability }
    : { anonymous: item.anonymous ?? false }),
});
const surface = (abi) => abi.filter((item) => ['function', 'event'].includes(item.type))
  .map(normalize).sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));

assert.deepEqual(surface(artifact.abi), surface(FLAP_ABI),
  'Flap Solidity and trade SDK ABIs differ; review tuple order, payable flags and event indexing');
console.log('Flap BNB Portal, seven functions and two events match the trade SDK.');
