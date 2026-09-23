import {getSimulator} from '../../lib/simulator.js';

/**
 * Standalone entry point, spawned as its own OS process by ui-client-cross-process.spec.ts. Boots
 * `udid` with a visible UI client and prints the observed UI client PID as JSON on stdout.
 *
 * Runs in a genuinely separate Node.js process from its siblings, so the cross-process lock file
 * in lib/extensions/ui-client.ts is what serializes them, not the in-process AsyncLock (which
 * concurrent calls from a single process already satisfy on its own).
 */
async function main(): Promise<void> {
  const [, , udid, startupTimeoutArg] = process.argv;
  const sim = await getSimulator(udid);
  await sim.run({isHeadless: false, startupTimeout: Number(startupTimeoutArg)});
  const uiClientPid = await sim.getUIClientPid();
  process.stdout.write(JSON.stringify({udid, uiClientPid}));
}

await main();
