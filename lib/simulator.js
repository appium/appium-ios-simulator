
import SimulatorXcode6 from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import { getVersion } from 'appium-xcode';
import log from './logger';

async function getSimulator (udid, xcodeVersion) {
  if (!xcodeVersion) {
    xcodeVersion = await getVersion();
  }

  let majorVersion = parseInt(xcodeVersion[0], 10);
  if (majorVersion < 6) {
    throw new Error(`Tried to use an iOS simulator with xcode ` +
                    `version ${xcodeVersion} but only Xcode version ` +
                    `6.0.0 and up are supported`);
  } else if (majorVersion === 7) {
    log.info(`Constructing iOS simulator for Xcode version ${xcodeVersion}`);
    return new SimulatorXcode7(udid, xcodeVersion);
  } else if (majorVersion === 6) {
    log.info(`Constructing iOS simulator for Xcode version ${xcodeVersion}`);
    return new SimulatorXcode6(udid, xcodeVersion);
  } else {
    throw new Error(`Xcode version ${xcodeVersion} is ` +
                    `not yet supported`);
  }
}

export { getSimulator };
