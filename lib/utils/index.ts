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
export {getSimulatorInfo, simExists} from './devices';
export {getMacAppPidByBundleId} from './process';
export {assertXcodeVersion, getDeveloperRoot} from './xcode';
export {killAllSimulators} from './lifecycle';

import {getDevices as getDevicesFn} from './devices';

// getDevices is defined here instead of re-exported so sinon can stub utils.getDevices in
// unit tests. Internal callers use `import * as utilsModule from './index'` and must see
// the stubbed function rather than a compile-time binding to devices.getDevices.
/** @inheritdoc */
export async function getDevices(
  ...args: Parameters<typeof getDevicesFn>
): ReturnType<typeof getDevicesFn> {
  return await getDevicesFn(...args);
}
