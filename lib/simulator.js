import SimulatorXcode6 from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import SimulatorXcode73 from './simulator-xcode-7.3';
import SimulatorXcode8 from './simulator-xcode-8';
import SimulatorXcode9 from './simulator-xcode-9';
import { simExists } from './utils';
import xcode from 'appium-xcode';
import log from './logger';


function handleUnsupportedXcode (xcodeVersion) {
  if (xcodeVersion.major < 6) {
    throw new Error(`Tried to use an iOS simulator with xcode ` +
                    `version ${xcodeVersion.versionString} but only Xcode version ` +
                    `6.0.0 and up are supported`);
  } else if (xcodeVersion.major >= 10) {
    throw new Error(`Xcode version ${xcodeVersion.versionString} is ` +
                    `not yet supported`);
  }
}

async function getSimulator (udid) {
  let xcodeVersion = await xcode.getVersion(true);

  if (!await simExists(udid)) {
    throw new Error(`No sim found with udid ${udid}`);
  }

  handleUnsupportedXcode(xcodeVersion);

  log.info(`Constructing iOS simulator for Xcode version ${xcodeVersion.versionString} ` +
           `with udid '${udid}'`);
  if (xcodeVersion.major === 6) {
    return new SimulatorXcode6(udid, xcodeVersion);
  } else if (xcodeVersion.major >= 7 && xcodeVersion.major < 8) {
    if (xcodeVersion.minor < 3) {
      return new SimulatorXcode7(udid, xcodeVersion);
    } else {
      return new SimulatorXcode73(udid, xcodeVersion);
    }
  } else if (xcodeVersion.major === 8) {
    return new SimulatorXcode8(udid, xcodeVersion);
  } else if (xcodeVersion.major === 9) {
    return new SimulatorXcode9(udid, xcodeVersion);
  }
}

async function getDeviceString (opts) {
  let xcodeVersion = await xcode.getVersion(true);

  handleUnsupportedXcode(xcodeVersion);

  log.info(`Retrieving device name string for Xcode version ${xcodeVersion.versionString}`);
  if (xcodeVersion.major >= 8) {
    return SimulatorXcode7.getDeviceString(opts);
  } else if (xcodeVersion.major === 7) {
    return SimulatorXcode7.getDeviceString(opts);
  } else if (xcodeVersion.major === 6) {
    return SimulatorXcode6.getDeviceString(opts);
  }
}

export { getSimulator, getDeviceString };
