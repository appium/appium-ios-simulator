import { SimulatorXcode10 } from './simulator-xcode-10';
import { SimulatorXcode11 } from './simulator-xcode-11';
import { SimulatorXcode11_4 } from './simulator-xcode-11.4';
import { SimulatorXcode14 } from './simulator-xcode-14';
import { SimulatorXcode15 } from './simulator-xcode-15';
import { getSimulatorInfo } from './utils';
import xcode from 'appium-xcode';
import { log } from './logger';

const MIN_SUPPORTED_XCODE_VERSION = 10;

/**
 * @template {import('appium-xcode').XcodeVersion} V
 * @param {V} xcodeVersion
 * @returns {V}
 */
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
 * Finds and returns the corresponding Simulator instance for the given ID.
 *
 * @param {string} udid - The ID of an existing Simulator.
 * @param {import('./types').SimulatorLookupOptions} [opts={}]
 * @throws {Error} If the Simulator with given udid does not exist in devices list.
 *   If you want to create a new simulator, you can use the `createDevice()` method of
 *   [node-simctl](github.com/appium/node-simctl).
 * @return {Promise<import('./types').Simulator>} Simulator object associated with the udid passed in.
 */
export async function getSimulator (udid, opts = {}) {
  let {
    platform = 'iOS',
    checkExistence = true,
    devicesSetPath,
    logger,
  } = opts;

  const xcodeVersion = handleUnsupportedXcode(
    /** @type {import('appium-xcode').XcodeVersion} */ (await xcode.getVersion(true))
  );
  if (checkExistence) {
    const simulatorInfo = await getSimulatorInfo(udid, {
      devicesSetPath
    });

    if (!simulatorInfo) {
      throw new Error(`No sim found with udid '${udid}'`);
    }

    platform = simulatorInfo.platform;
  }

  (logger ?? log).info(
    `Constructing ${platform} simulator for Xcode version ${xcodeVersion.versionString} with udid '${udid}'`
  );
  let SimClass;
  switch (xcodeVersion.major) {
    case MIN_SUPPORTED_XCODE_VERSION:
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
      SimClass = SimulatorXcode14;
      break;
    case 15:
    default:
      SimClass = SimulatorXcode15;
      break;
  }

  const result = new SimClass(udid, xcodeVersion, logger);
  if (devicesSetPath) {
    result.devicesSetPath = devicesSetPath;
  }
  return result;
}
