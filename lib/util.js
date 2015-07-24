import xcode from 'appium-xcode';
import log from './logger';
import { exec } from 'teen_process';

async function killAllSimulators () {
  let version = await xcode.getVersion();
  // this is contrary to our usual pattern, but if getting the xcode version
  // fails, we couldn't have started simulators anyways/
  log.debug("Killing all iOS Simulators");
  try {
    await exec('pkill', ['-9', '-f',
      version >= "6" ? 'iOS Simulator' : 'iPhoneSimulator']);
  } catch (ign) {}
}

export { killAllSimulators };

// function getPlistData (file) {
//
// }
//
// export { getPlistData };
