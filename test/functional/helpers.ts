import assert from 'node:assert/strict';

export const LONG_TIMEOUT = 480 * 1000 * (process.env.CI ? 2 : 1);

/** Scales a short poll timeout up for CI, where hosted runners are several times slower. */
export function ciScale(waitMs: number): number {
  return waitMs * (process.env.CI ? 3 : 1);
}

export async function verifyStates(sim: any, shouldServerRun: boolean, shouldClientRun: boolean): Promise<void> {
  const isServerRunning = await sim.isRunning();
  assert.strictEqual(isServerRunning, shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  assert.strictEqual(isClientRunning, shouldClientRun);
}
