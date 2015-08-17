import log from './logger';
import { exec } from 'teen_process';

async function killAllSimulators () {
  log.debug('Killing all iOS Simulators');
  try {
    await exec('pkill', ['-9', '-f', 'iOS Simulator']);
  } catch (ign) {}
}

export { killAllSimulators };
