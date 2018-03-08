import SimulatorXcode6 from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import SimulatorXcode73 from './simulator-xcode-7.3';
import SimulatorXcode8 from './simulator-xcode-8';
import SimulatorXcode9 from './simulator-xcode-9';
import SimulatorXcode93 from './simulator-xcode-9.3';
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

/**
 * Finds and returns the corresponding Simulator instance for the given ID.
 *
 * @param {string} udid - The ID of an existing Simulator.
 * @throws {Error} If the Simulator with given udid does not exist in devices list.
 *   If you want to create a new simulator, you can use the `createDevice()` method of
 *   [node-simctl](github.com/appium/node-simctl).
 * @return {object} Simulator object associated with the udid passed in.
 */
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
    if (xcodeVersion.minor < 3) {
      return new SimulatorXcode9(udid, xcodeVersion);
    } else {
      return new SimulatorXcode93(udid, xcodeVersion);
    }
  }
}

/**
 * Takes a set of options and finds the correct device string in order for Instruments to
 * identify the correct simulator.
 *
 * @param {object} opts - The options available are:
 *   - `deviceName` - a name for the device. If the given device name starts with `=`, the name, less the equals sign, is returned.
 *   - `platformVersion` - the version of iOS to use. Defaults to the current Xcode's maximum SDK version.
 *   - `forceIphone` - force the configuration of the device string to iPhone. Defaults to `false`.
 *   - `forceIpad` - force the configuration of the device string to iPad. Defaults to `false`.
 *   If both `forceIphone` and `forceIpad` are true, the device will be forced to iPhone.
 *
 * @return {string} The found device string, for example:
 *   'iPhone 5 (8.4)' with Xcode 7+
 *   'iPhone 5 (8.4 Simulator)' with Xcode 6+
 */
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
