/** Keep legacy-chain credentials isolated from the current BNB CLASHR_* wallet. */
export function legacyEnvironment(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const result = { ...env };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('RUSHR_')) {
      const current = `CLASHR_ROBINHOOD_${key.slice('RUSHR_'.length)}`;
      if (result[current] === undefined) result[current] = value;
    }
  }
  return result;
}
