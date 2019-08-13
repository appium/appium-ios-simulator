import SimulatorXcode6 from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import SimulatorXcode73 from './simulator-xcode-7.3';
import SimulatorXcode8 from './simulator-xcode-8';
import SimulatorXcode9 from './simulator-xcode-9';
import SimulatorXcode93 from './simulator-xcode-9.3';
import SimulatorXcode10 from './simulator-xcode-10';
import SimulatorXcode11 from './simulator-xcode-11';
import { getSimulatorInfo } from './utils';
import xcode from 'appium-xcode';
import { log, setLoggingPlatform } from './logger';


function handleUnsupportedXcode (xcodeVersion) {
  if (xcodeVersion.major < 6) {
    throw new Error(`Tried to use an iOS simulator with xcode ` +
                    `version ${xcodeVersion.versionString} but only Xcode version ` +
                    `6.0.0 and up are supported`);
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
  const xcodeVersion = await xcode.getVersion(true);
  const simulatorInfo = await getSimulatorInfo(udid);

  if (!simulatorInfo) {
    throw new Error(`No sim found with udid '${udid}'`);
  }

  // make sure we have the right logging prefix
  setLoggingPlatform(simulatorInfo.platform);

  log.info(`Constructing ${simulatorInfo.platform || 'iOS'} simulator for Xcode version ${xcodeVersion.versionString} ` +
           `with udid '${udid}'`);
  let SimClass;
  switch (xcodeVersion.major) {
    case 6:
      SimClass = SimulatorXcode6;
      break;
    case 7:
      if (xcodeVersion.minor < 3) {
        SimClass = SimulatorXcode7;
      } else {
        SimClass = SimulatorXcode73;
      }
      break;
    case 8:
      SimClass = SimulatorXcode8;
      break;
    case 9:
      if (xcodeVersion.minor < 3) {
        SimClass = SimulatorXcode9;
      } else {
        SimClass = SimulatorXcode93;
      }
      break;
    case 10:
      SimClass = SimulatorXcode10;
      break;
    case 11:
      SimClass = SimulatorXcode11;
      break;
    default:
      handleUnsupportedXcode(xcodeVersion);
      SimClass = SimulatorXcode93;
  }
  return new SimClass(udid, xcodeVersion);
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
    return await SimulatorXcode7.getDeviceString(opts);
  } else if (xcodeVersion.major === 7) {
    return await SimulatorXcode7.getDeviceString(opts);
  } else if (xcodeVersion.major === 6) {
    return await SimulatorXcode6.getDeviceString(opts);
  }
}

export { getSimulator, getDeviceString };
