import { waitForCondition } from 'asyncbox';

const LONG_TIMEOUT = 480 * 1000;

async function verifyStates (sim, shouldServerRun, shouldClientRun) {
  const isServerRunning = await sim.isRunning();
  isServerRunning.should.eql(shouldServerRun);
  await waitForCondition(async () => {
    const isClientRunning = await sim.isUIClientRunning();
    return isClientRunning === shouldClientRun;
  }, {waitMs: 60000, intervalMs: 5000});
}

export { LONG_TIMEOUT, verifyStates };
