import {expect} from 'chai';

export const LONG_TIMEOUT = 480 * 1000 * (process.env.CI ? 2 : 1);

export async function verifyStates(
  sim: any,
  shouldServerRun: boolean,
  shouldClientRun: boolean,
): Promise<void> {
  const isServerRunning = await sim.isRunning();
  expect(isServerRunning).to.eql(shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  expect(isClientRunning).to.eql(shouldClientRun);
}
