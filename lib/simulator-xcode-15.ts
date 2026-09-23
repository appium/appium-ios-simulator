import path from 'node:path';

import type {NativeSimctl} from '@appium/coresim';
import type {AppiumLogger} from '@appium/types';
import type {XcodeVersion} from 'appium-xcode';

import {BaseSimulator} from './base-simulator.js';
import * as appExtensions from './extensions/applications.js';
import * as biometricExtensions from './extensions/biometric.js';
import * as geolocationExtensions from './extensions/geolocation.js';
import * as keychainExtensions from './extensions/keychain.js';
import * as lifecycleExtensions from './extensions/lifecycle.js';
import * as miscExtensions from './extensions/misc.js';
import * as pasteboardExtensions from './extensions/pasteboard.js';
import * as pathsExtensions from './extensions/paths.js';
import * as permissionsExtensions from './extensions/permissions.js';
import * as processExtensions from './extensions/process.js';
import * as safariExtensions from './extensions/safari.js';
import * as screenshotExtensions from './extensions/screenshot.js';
import * as settingsExtensions from './extensions/settings.js';
import * as systemRootExtensions from './extensions/system-root.js';
import * as uiClientExtensions from './extensions/ui-client.js';
import * as videoRecordingExtensions from './extensions/video-recording.js';
import * as videoStreamExtensions from './extensions/video-stream.js';
import {log as defaultLog} from './logger.js';
import {createNativeSimctl} from './native/native-simctl.js';
import type {CoreSimulator} from './types.js';
import {SIMULATOR_UI_CLIENT_BUNDLE_ID} from './utils/index.js';

const STARTUP_TIMEOUT_MS = 120 * 1000;

// Every method beyond the identity getters/setters below is mixed in onto the prototype via the
// `Object.assign` call at the bottom of this file, grouped by concern into `extensions/*.ts`
// modules — this class itself only holds construction/identity state, so subclasses can override
// any mixed-in method as a regular class method (and still call `super.methodName()`). Each
// `extensions/*.ts` module declares its own methods on the `SimulatorXcode15` type via a
// `declare module` augmentation, since the class body itself never defines them.
export class SimulatorXcode15 extends BaseSimulator implements CoreSimulator {
  _keychainsBackupPath: string | null | undefined;
  _platformVersion: string | null | undefined;
  _webInspectorSocket: string | null | undefined;
  _uiClientAppPath: Promise<string> | undefined;
  _systemAppBundleIds: Set<string> | undefined;

  private readonly _udid: string;
  /**
   * @internal Not part of the public `CoreSimulator`/`Simulator` API — see `lib/native/types.ts`'s
   * `HasNativeSimctl`, which extension modules type their `this` against to reach this.
   */
  _native: NativeSimctl;
  private _devicesSetPath: string | null = null;
  private readonly _xcodeVersion: XcodeVersion;
  private readonly _log: AppiumLogger;

  /**
   * Constructs the object with the `udid` and version of Xcode.
   * Use the exported `getSimulator(udid)` method instead.
   *
   * @param udid - The Simulator ID.
   * @param xcodeVersion - The target Xcode version in format {major, minor, build}.
   * @param log - Optional logger instance.
   */
  constructor(udid: string, xcodeVersion: XcodeVersion, log: AppiumLogger | null = null) {
    super();

    this._udid = String(udid);
    this._native = createNativeSimctl(this._devicesSetPath);
    this._xcodeVersion = xcodeVersion;
    // platformVersion cannot be found initially, since getting it has side effects for
    // our logic for figuring out if a sim has been run
    // it will be set when it is needed
    this._platformVersion = null;
    this._webInspectorSocket = null;
    this._uiClientAppPath = undefined;
    this._systemAppBundleIds = undefined;
    this._log = log ?? defaultLog;
  }

  /**
   * @returns The unique device identifier (UDID) of the simulator.
   */
  get udid(): string {
    return this._udid;
  }

  /**
   * @returns The Xcode version information.
   */
  get xcodeVersion(): XcodeVersion {
    return this._xcodeVersion;
  }

  /**
   * @returns The full path to the keychain directory for this simulator.
   */
  get keychainPath(): string {
    return path.resolve(this.getDir(), 'Library', 'Keychains');
  }

  /**
   * @returns The logger instance used by this simulator.
   */
  get log(): AppiumLogger {
    return this._log;
  }

  /**
   * @returns The bundle identifier of the Simulator UI client.
   */
  get uiClientBundleId(): string {
    return SIMULATOR_UI_CLIENT_BUNDLE_ID;
  }

  /**
   * @returns The maximum number of milliseconds to wait until Simulator booting is completed.
   */
  get startupTimeout(): number {
    return STARTUP_TIMEOUT_MS;
  }

  /**
   * @returns The full path to the devices set where the current simulator is located.
   * `null` value means that the default path is used.
   */
  get devicesSetPath(): string | null {
    return this._devicesSetPath;
  }

  /**
   * Set the full path to the devices set. It is recommended to set this value
   * once right after Simulator instance is created and to not change it during
   * the instance lifecycle.
   *
   * @param value - The full path to the devices set root on the local file system.
   */
  set devicesSetPath(value: string | null) {
    this._devicesSetPath = value;
    this._native = createNativeSimctl(value);
  }
}

Object.assign(SimulatorXcode15.prototype, {
  // paths
  getRootDir: pathsExtensions.getRootDir,
  getDir: pathsExtensions.getDir,
  getLogDir: pathsExtensions.getLogDir,

  // lifecycle
  stat: lifecycleExtensions.stat,
  isFresh: lifecycleExtensions.isFresh,
  isRunning: lifecycleExtensions.isRunning,
  isShutdown: lifecycleExtensions.isShutdown,
  getPlatformVersion: lifecycleExtensions.getPlatformVersion,
  boot: lifecycleExtensions.boot,
  waitForBoot: lifecycleExtensions.waitForBoot,
  clean: lifecycleExtensions.clean,
  delete: lifecycleExtensions.deleteDevice,
  shutdown: lifecycleExtensions.shutdown,

  // UI client
  getUIClientPid: uiClientExtensions.getUIClientPid,
  isUIClientRunning: uiClientExtensions.isUIClientRunning,
  startUIClient: uiClientExtensions.startUIClient,
  killUIClient: uiClientExtensions.killUIClient,
  launchWindow: uiClientExtensions.launchWindow,
  run: uiClientExtensions.run,

  // system root
  getLaunchDaemonsRoot: systemRootExtensions.getLaunchDaemonsRoot,

  // applications
  installApp: appExtensions.installApp,
  getUserInstalledBundleIdsByBundleName: appExtensions.getUserInstalledBundleIdsByBundleName,
  isAppInstalled: appExtensions.isAppInstalled,
  removeApp: appExtensions.removeApp,
  launchApp: appExtensions.launchApp,
  terminateApp: appExtensions.terminateApp,
  isAppRunning: appExtensions.isAppRunning,
  scrubApp: appExtensions.scrubApp,
  getAppContainer: appExtensions.getAppContainer,
  appInfo: appExtensions.appInfo,

  // pasteboard
  getPasteboard: pasteboardExtensions.getPasteboard,
  setPasteboard: pasteboardExtensions.setPasteboard,

  // screenshot
  getScreenshot: screenshotExtensions.getScreenshot,

  // video recording
  startVideoRecording: videoRecordingExtensions.startVideoRecording,
  stopVideoRecording: videoRecordingExtensions.stopVideoRecording,
  isVideoRecording: videoRecordingExtensions.isVideoRecording,

  // video streaming
  startVideoStream: videoStreamExtensions.startVideoStream,

  // process
  spawnProcess: processExtensions.spawnProcess,
  ps: processExtensions.ps,

  // safari
  openUrl: safariExtensions.openUrl,
  scrubSafari: safariExtensions.scrubSafari,
  updateSafariSettings: safariExtensions.updateSafariSettings,
  getWebInspectorSocket: safariExtensions.getWebInspectorSocket,

  // biometric
  isBiometricEnrolled: biometricExtensions.isBiometricEnrolled,
  enrollBiometric: biometricExtensions.enrollBiometric,
  sendBiometricMatch: biometricExtensions.sendBiometricMatch,

  // keychain
  backupKeychains: keychainExtensions.backupKeychains,
  restoreKeychains: keychainExtensions.restoreKeychains,
  clearKeychains: keychainExtensions.clearKeychains,

  // geolocation
  setGeolocation: geolocationExtensions.setGeolocation,

  // misc
  shake: miscExtensions.shake,
  addCertificate: miscExtensions.addCertificate,
  pushNotification: miscExtensions.pushNotification,
  addMedia: miscExtensions.addMedia,

  // permissions
  setPermission: permissionsExtensions.setPermission,
  setPermissions: permissionsExtensions.setPermissions,
  getPermission: permissionsExtensions.getPermission,

  // settings
  updateSettings: settingsExtensions.updateSettings,
  setAppearance: settingsExtensions.setAppearance,
  getAppearance: settingsExtensions.getAppearance,
  setIncreaseContrast: settingsExtensions.setIncreaseContrast,
  getIncreaseContrast: settingsExtensions.getIncreaseContrast,
  setContentSize: settingsExtensions.setContentSize,
  getContentSize: settingsExtensions.getContentSize,
  configureLocalization: settingsExtensions.configureLocalization,
  setAutoFillPasswords: settingsExtensions.setAutoFillPasswords,
  setReduceMotion: settingsExtensions.setReduceMotion,
  setReduceTransparency: settingsExtensions.setReduceTransparency,
  disableKeyboardIntroduction: settingsExtensions.disableKeyboardIntroduction,
});
