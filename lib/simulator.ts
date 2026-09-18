import * as xcode from 'appium-xcode';

import {log} from './logger.js';
import {SimulatorXcode15} from './simulator-xcode-15.js';
import {SimulatorXcode27} from './simulator-xcode-27.js';
import type {Simulator, SimulatorLookupOptions} from './types.js';
import {assertXcodeVersion, getSimulatorInfo, MIN_DEVICE_HUB_XCODE_VERSION} from './utils/index.js';

/**
 * Finds and returns the corresponding Simulator instance for the given ID.
 *
 * @param udid - The ID of an existing Simulator.
 * @param opts - Simulator lookup options
 * @throws {Error} If the Simulator with given udid does not exist in devices list.
 *   If you want to create a new simulator, use this package's own `createSimulator()`.
 * @return Simulator object associated with the udid passed in.
 */
export async function getSimulator(udid: string, opts: SimulatorLookupOptions = {}): Promise<Simulator> {
  let platform = opts.platform ?? 'iOS';
  const {checkExistence = true, devicesSetPath, logger} = opts;

  const xcodeVersion = assertXcodeVersion((await xcode.getVersion(true)) as xcode.XcodeVersion);
  if (checkExistence) {
    const simulatorInfo = await getSimulatorInfo(udid, {
      devicesSetPath,
    });

    if (!simulatorInfo) {
      throw new Error(`No sim found with udid '${udid}'`);
    }

    platform = simulatorInfo.platform;
  }

  (logger ?? log).info(
    `Constructing ${platform} simulator for Xcode version ${xcodeVersion.versionString} with udid '${udid}'`,
  );
  const SimClass: typeof SimulatorXcode15 | typeof SimulatorXcode27 =
    xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION ? SimulatorXcode27 : SimulatorXcode15;

  const result = new SimClass(udid, xcodeVersion, logger);
  if (devicesSetPath) {
    result.devicesSetPath = devicesSetPath;
  }
  return result;
}
