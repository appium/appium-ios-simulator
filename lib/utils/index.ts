export {
  SAFARI_STARTUP_TIMEOUT_MS,
  MOBILE_SAFARI_BUNDLE_ID,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  MIN_SUPPORTED_XCODE_VERSION,
  MIN_DEVICE_HUB_XCODE_VERSION,
} from './constants.js';
export type {SimulatorInfoOptions} from './types.js';
export {NSUserDefaults, toXmlArg, generateDefaultsCommandArgs} from './defaults.js';
export {getDevices} from './get-devices.js';
export {getSimulatorInfo, simExists} from './devices.js';
export {getMacAppPidByBundleId} from './process.js';
export {assertXcodeVersion, getUiClientAppPath, readBundleIdFromPlist} from './xcode.js';
export {killAllSimulators} from './lifecycle.js';
