const LONG_TIMEOUT = (480 * 1000) * (process.env.CI ? 2 : 1);


async function verifyStates (sim, shouldServerRun, shouldClientRun) {
  const isServerRunning = await sim.isRunning();
  isServerRunning.should.eql(shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  isClientRunning.should.eql(shouldClientRun);
}

export { LONG_TIMEOUT, verifyStates };
