import { expect } from 'chai';

const LONG_TIMEOUT = (480 * 1000) * (process.env.CI ? 2 : 1);


async function verifyStates (sim: any, shouldServerRun: boolean, shouldClientRun: boolean): Promise<void> {
  const isServerRunning = await sim.isRunning();
  expect(isServerRunning).to.eql(shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  expect(isClientRunning).to.eql(shouldClientRun);
}

export { LONG_TIMEOUT, verifyStates };

