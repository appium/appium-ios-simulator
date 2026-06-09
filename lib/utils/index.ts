export {
  SAFARI_STARTUP_TIMEOUT_MS,
  MOBILE_SAFARI_BUNDLE_ID,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  MIN_SUPPORTED_XCODE_VERSION,
  MIN_DEVICE_HUB_XCODE_VERSION,
} from './constants';
export type {SimulatorInfoOptions} from './types';
export {NSUserDefaults, toXmlArg, generateDefaultsCommandArgs} from './defaults';
export {getDevices} from './get-devices';
export {getSimulatorInfo, simExists} from './devices';
export {getMacAppPidByBundleId} from './process';
export {assertXcodeVersion, getDeveloperRoot} from './xcode';
export {killAllSimulators} from './lifecycle';
