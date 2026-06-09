import {SimulatorXcode14} from './simulator-xcode-14';
import {SimulatorXcode15} from './simulator-xcode-15';
import {SimulatorXcode27} from './simulator-xcode-27';
import {
  assertXcodeVersion,
  getSimulatorInfo,
  MIN_DEVICE_HUB_XCODE_VERSION,
  MIN_SUPPORTED_XCODE_VERSION,
} from './utils';
import * as xcode from 'appium-xcode';
import {log} from './logger';
import type {Simulator, SimulatorLookupOptions} from './types';

/**
 * Finds and returns the corresponding Simulator instance for the given ID.
 *
 * @param udid - The ID of an existing Simulator.
 * @param opts - Simulator lookup options
 * @throws {Error} If the Simulator with given udid does not exist in devices list.
 *   If you want to create a new simulator, you can use the `createDevice()` method of
 *   [node-simctl](github.com/appium/node-simctl).
 * @return Simulator object associated with the udid passed in.
 */
export async function getSimulator(
  udid: string,
  opts: SimulatorLookupOptions = {},
): Promise<Simulator> {
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
  let SimClass: typeof SimulatorXcode14 | typeof SimulatorXcode15 | typeof SimulatorXcode27;
  if (xcodeVersion.major === MIN_SUPPORTED_XCODE_VERSION) {
    SimClass = SimulatorXcode14;
  } else if (xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION) {
    SimClass = SimulatorXcode27;
  } else {
    SimClass = SimulatorXcode15;
  }

  const result = new SimClass(udid, xcodeVersion, logger);
  if (devicesSetPath) {
    result.devicesSetPath = devicesSetPath;
  }
  return result;
}
