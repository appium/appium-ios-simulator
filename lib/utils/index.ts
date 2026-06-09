export {
  SAFARI_STARTUP_TIMEOUT_MS,
  MOBILE_SAFARI_BUNDLE_ID,
  SIMULATOR_APP_NAME,
  DEVICE_HUB_APP_NAME,
  MIN_SUPPORTED_XCODE_VERSION,
  MIN_DEVICE_HUB_XCODE_VERSION,
} from './constants';
export type {SimulatorInfoOptions} from './types';
export {NSUserDefaults, toXmlArg, generateDefaultsCommandArgs} from './defaults';

import {
  getDevices as getDevicesFn,
  getSimulatorInfo as getSimulatorInfoFn,
  simExists as simExistsFn,
} from './devices';
import {getMacAppPidByBundleId as getMacAppPidByBundleIdFn} from './process';
import {assertXcodeVersion as assertXcodeVersionFn, getDeveloperRoot as getDeveloperRootFn} from './xcode';
import {killAllSimulators as killAllSimulatorsFn} from './lifecycle';

/** @inheritdoc */
export async function getDevices(
  ...args: Parameters<typeof getDevicesFn>
): ReturnType<typeof getDevicesFn> {
  return await getDevicesFn(...args);
}

/** @inheritdoc */
export async function getSimulatorInfo(
  ...args: Parameters<typeof getSimulatorInfoFn>
): ReturnType<typeof getSimulatorInfoFn> {
  return await getSimulatorInfoFn(...args);
}

/** @inheritdoc */
export async function simExists(
  ...args: Parameters<typeof simExistsFn>
): ReturnType<typeof simExistsFn> {
  return await simExistsFn(...args);
}

/** @inheritdoc */
export async function getMacAppPidByBundleId(
  ...args: Parameters<typeof getMacAppPidByBundleIdFn>
): ReturnType<typeof getMacAppPidByBundleIdFn> {
  return await getMacAppPidByBundleIdFn(...args);
}

/** @inheritdoc */
export function assertXcodeVersion(
  ...args: Parameters<typeof assertXcodeVersionFn>
): ReturnType<typeof assertXcodeVersionFn> {
  return assertXcodeVersionFn(...args);
}

/** @inheritdoc */
export async function getDeveloperRoot(): ReturnType<typeof getDeveloperRootFn> {
  return await getDeveloperRootFn();
}

/** @inheritdoc */
export async function killAllSimulators(
  ...args: Parameters<typeof killAllSimulatorsFn>
): ReturnType<typeof killAllSimulatorsFn> {
  return await killAllSimulatorsFn(...args);
}
