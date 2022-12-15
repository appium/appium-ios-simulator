import SimulatorXcode8 from './simulator-xcode-8';
import SimulatorXcode9 from './simulator-xcode-9';
import SimulatorXcode93 from './simulator-xcode-9.3';
import SimulatorXcode10 from './simulator-xcode-10';
import SimulatorXcode11 from './simulator-xcode-11';
import SimulatorXcode11_4 from './simulator-xcode-11.4';
import SimulatorXcode14 from './simulator-xcode-14';
import { getSimulatorInfo } from './utils';
import xcode from 'appium-xcode';
import { log, setLoggingPlatform } from './logger';

const MIN_SUPPORTED_XCODE_VERSION = 8;

function handleUnsupportedXcode (xcodeVersion) {
  if (xcodeVersion.major < MIN_SUPPORTED_XCODE_VERSION) {
    throw new Error(
      `Tried to use an iOS simulator with xcode version ${xcodeVersion.versionString} but only Xcode version ` +
      `${MIN_SUPPORTED_XCODE_VERSION} and up are supported`
    );
  }
  return xcodeVersion;
}

/**
 * @typedef {Object} SimulatorLookupOptions
 * @property {?string} platform [iOS] - The name of the simulator platform
 * @property {?boolean} checkExistence [true] - Set it to `false` in order to
 * skip simulator existence verification
 * @property {?string} devicesSetPath - The full path to the devices set where
 * the current simulator is located. `null` value means that the default path is
 * used, which is usually `~/Library/Developer/CoreSimulator/Devices`
 */

/**
 * Finds and returns the corresponding Simulator instance for the given ID.
 *
 * @param {string} udid - The ID of an existing Simulator.
 * @param {?SimulatorLookupOptions} opts
 * @throws {Error} If the Simulator with given udid does not exist in devices list.
 *   If you want to create a new simulator, you can use the `createDevice()` method of
 *   [node-simctl](github.com/appium/node-simctl).
 * @return {object} Simulator object associated with the udid passed in.
 */
async function getSimulator (udid, opts = {}) {
  let {
    platform = 'iOS',
    checkExistence = true,
    devicesSetPath,
  } = opts;

  const xcodeVersion = handleUnsupportedXcode(await xcode.getVersion(true));
  if (checkExistence) {
    const simulatorInfo = await getSimulatorInfo(udid, {
      devicesSetPath
    });

    if (!simulatorInfo) {
      throw new Error(`No sim found with udid '${udid}'`);
    }

    platform = simulatorInfo.platform;
  }

  // make sure we have the right logging prefix
  setLoggingPlatform(platform);

  log.info(
    `Constructing ${platform} simulator for Xcode version ${xcodeVersion.versionString} with udid '${udid}'`
  );
  let SimClass;
  switch (xcodeVersion.major) {
    case 8:
      SimClass = SimulatorXcode8;
      break;
    case 9:
      SimClass = xcodeVersion.minor < 3 ? SimulatorXcode9 : SimulatorXcode93;
      break;
    case 10:
      SimClass = SimulatorXcode10;
      break;
    case 11:
      SimClass = xcodeVersion.minor < 4 ? SimulatorXcode11 : SimulatorXcode11_4;
      break;
    case 12:
    case 13:
      SimClass = SimulatorXcode11_4;
      break;
    case 14:
    default:
      SimClass = SimulatorXcode14;
      break;
  }

  const result = new SimClass(udid, xcodeVersion);
  if (devicesSetPath) {
    result.devicesSetPath = devicesSetPath;
  }
  return result;
}

export { getSimulator };
