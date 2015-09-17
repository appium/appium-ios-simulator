import log from './logger';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';


async function killAllSimulators () {
  log.debug('Killing all iOS Simulators');
  try {
    await exec('pkill', ['-9', '-f', 'iOS Simulator']);
  } catch (ign) {}
}

async function endAllSimulatorDaemons () {
  log.debug('Ending all simulator daemons');
  for (let servicePattern of ['com.apple.iphonesimulator', 'com.apple.CoreSimulator']) {
    log.debug(`Killing any other ${servicePattern} daemons`);
    try {
      let stopCmd = `launchctl list | grep ${servicePattern} | cut -f 3 | xargs -n 1 launchctl stop`;
      await exec('bash', ['-c', stopCmd]);
    } catch (err) {
      log.warn(`Could not stop ${servicePattern} daemons, carrying on anyway!`);
    }
    try {
      let removeCmd = `launchctl list | grep ${servicePattern} | cut -f 3 | xargs -n 1 launchctl remove`;
      await exec('bash', ['-c', removeCmd]);
    } catch (err) {
      log.warn(`Could not remove ${servicePattern} daemons, carrying on anyway!`);
    }
  }
  // waiting until the simulator service has died.
  try {
    await waitForCondition(async () => {
      let {stdout} = await exec('bash', ['-c',
        `ps -e  | grep launchd_sim | grep -v bash | grep -v grep | awk {'print$1'}`]);
      return stdout.trim().length === 0;
    }, {waitMs: 5000, intervalMs: 500});
  } catch (err) {
    log.warn(`Could not end all simulator daemons, carrying on!`);
  }
  log.debug('Finishing ending all simulator daemons');
}

export { killAllSimulators, endAllSimulatorDaemons };
