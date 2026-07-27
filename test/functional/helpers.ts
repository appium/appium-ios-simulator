import assert from 'node:assert/strict';

export const LONG_TIMEOUT = 480 * 1000 * (process.env.CI ? 2 : 1);

export async function verifyStates(sim: any, shouldServerRun: boolean, shouldClientRun: boolean): Promise<void> {
  const isServerRunning = await sim.isRunning();
  assert.strictEqual(isServerRunning, shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  assert.strictEqual(isClientRunning, shouldClientRun);
}
