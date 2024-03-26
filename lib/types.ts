import type { EventEmitter } from 'node:events';
import type { Simctl } from 'node-simctl';
import type { XcodeVersion } from 'appium-xcode';
import type { AppiumLogger, StringRecord } from '@appium/types';

export interface ProcessInfo {
  /**
   * The actual process identifier.
   * Could be zero if the process is the system one.
   */
  pid: number;
  /**
   * The process group identifier.
   * This could be `null` if the process is not a part of the
   * particular group. For `normal` application processes the group
   * name usually equals to `UIKitApplication`.
   */
  group: string|null;
  /**
   * The process name, for example `com.apple.Preferences`
   */
  name: string;
}

export interface DevicePreferences {
  /** TBD. Example value: 2.114 */
  SimulatorExternalDisplay?: number;
  /** TBD. Example value: '' */
  ChromeTint?: string;
  /** Scale value for the particular Simulator window. 1.0 means 100% scale. */
  SimulatorWindowLastScale?: number;
  /** Simulator window orientation. Possible values are: 'Portrait', 'LandscapeLeft', 'PortraitUpsideDown' and 'LandscapeRight'. */
  SimulatorWindowOrientation?: string;
  /**
   * Window rotation angle. This value is expected to be in sync
   * with _SimulatorWindowOrientation_. The corresponding values are:
   * 0, 90, 180 and 270.
   */
  SimulatorWindowRotationAngle?: number;
  /**
   * The coordinates of Simulator's window center in pixels, for example '{-1294.5, 775.5}'.
   */
  SimulatorWindowCenter?: string;
  /** Equals to 1 if hardware keyboard should be connected. Otherwise 0. */
  ConnectHardwareKeyboard?: boolean;
}

export interface CommonPreferences {
  /** Whether to connect hardware keyboard */
  ConnectHardwareKeyboard?: boolean;
}

export interface StartUiClientOptions {
  /**
   * Defines the window scale value for the UI client window for the current Simulator.
   * Equals to null by default, which keeps the current scale unchanged.
   * It should be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   */
  scaleFactor?: string;
  /**
   * Number of milliseconds to wait until Simulator booting
   * process is completed. The default timeout of 60000 ms will be used if not set explicitly.
   */
  startupTimeout?: number;
}

export interface RunOptions extends StartUiClientOptions {
  /**
   * Whether to connect the hardware keyboard to the
   * Simulator UI client. Equals to `false` by default.
   */
  connectHardwareKeyboard?: boolean;
  /**
   * Whether to start the Simulator in headless mode (with UI
   * client invisible). `false` by default.
   */
  isHeadless?: boolean;
  /**
   * Whether to highlight touches on Simulator
   * screen. This is helpful while debugging automated tests or while observing the automation
   * recordings. `false` by default.
   */
  tracePointer?: boolean;
  /**
   * Whether to disable pasteboard sync with the
   * Simulator UI client or respect the system wide preference. 'on', 'off', or 'system' is available.
   * The sync increases launching simulator process time, but it allows system to sync pasteboard
   * with simulators. Follows system-wide preference if the value is 'system'.
   * Defaults to 'off'.
   */
  pasteboardAutomaticSync?: string;
  /**
   * Preferences of the newly created Simulator device
   */
  devicePreferences?: DevicePreferences;
}

export interface ShutdownOptions {
  /**
   * The number of milliseconds to wait until
   * Simulator is shut down completely. No wait happens if the timeout value is not set
   */
  timeout?: number|string;
}

export interface KillUiClientOptions {
  /** Process id of the UI Simulator window */
  pid?: number | string | null;
  /** The signal number to send to the. 2 (SIGINT) by default */
  signal?: number | string;
}

export interface DeviceStat {
  /** Simulator name, for example 'iPhone 10' */
  name: string;
  /** Device UDID, for example 'C09B34E5-7DCB-442E-B79C-AB6BC0357417' */
  udid: string;
  /** For example 'Booted' or 'Shutdown' */
  state: string;
  /** For example '12.4' */
  sdk: string;
}

export interface CoreSimulator extends EventEmitter {
  _keychainsBackupPath: string|null|undefined;
  _webInspectorSocket: string|null|undefined;

  get keychainPath(): string;
  get udid(): string;
  get simctl(): Simctl;
  get xcodeVersion(): XcodeVersion;

  set devicesSetPath(value: string|null);
  get devicesSetPath(): string|null;

  get idb(): any;
  set idb(value: any);

  get startupTimeout(): number;
  get uiClientBundleId(): string;

  get log(): AppiumLogger;

  getUIClientPid(): Promise<string|null>;
  isUIClientRunning(): Promise<boolean>;
  getPlatformVersion(): Promise<string>;
  getRootDir(): string;
  getDir(): string;
  getLogDir(): string;
  stat(): Promise<DeviceStat|StringRecord<never>>;
  isFresh(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  isShutdown(): Promise<boolean>;
  startUIClient(opts?: StartUiClientOptions): Promise<void>;
  run(opts?: RunOptions): Promise<void>;
  clean(): Promise<void>;
  shutdown(opts?: ShutdownOptions): Promise<void>;
  delete(): Promise<void>;
  ps(): Promise<ProcessInfo[]>;
  killUIClient(opts?: KillUiClientOptions): Promise<boolean>;
  waitForBoot(startupTimeout: number): Promise<void>;
  getLaunchDaemonsRoot(): Promise<string>;
}

export interface LaunchAppOptions {
  /**
   * Whether to wait until the app has fully started and
   * is present in processes list. `false` by default.
   */
  wait?: boolean;
  /**
   * The number of milliseconds to wait until
   * the app is fully started. Only applicatble if `wait` is true. 10000 ms by default.
   */
  timeoutMs?: number;
}

export interface InteractsWithApps {
  installApp(app: string): Promise<void>;
  getUserInstalledBundleIdsByBundleName(bundleName: string): Promise<string[]>;
  isAppInstalled(bundleId: string): Promise<boolean>;
  removeApp(bundleId: string): Promise<void>;
  launchApp(bundleId: string, opts?: LaunchAppOptions): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  isAppRunning(bundleId: string): Promise<boolean>;
  scrubApp(bundleId: string): Promise<void>;
}

export interface SupportsBiometric {
  isBiometricEnrolled(): Promise<boolean>;
  enrollBiometric(isEnabled: boolean): Promise<void>;
  sendBiometricMatch(shouldMatch: boolean, biometricName: string): Promise<void>;
}

export interface SupportsGeolocation {
  setGeolocation(latitude: string|number, longitude: string|number): Promise<boolean>;
}

export interface InteractsWithKeychain {
  backupKeychains(): Promise<boolean>;
  restoreKeychains(excludePatterns: string[]): Promise<boolean>;
  clearKeychains(): Promise<void>;
}

export interface SupportsAppPermissions {
  setPermission(bundleId: string, permission: string, value: string): Promise<void>;
  setPermissions(bundleId: string, permissionsMapping: StringRecord): Promise<void>;
  getPermission(bundleId: string, serviceName: string): Promise<string>;
}

export interface InteractsWithSafariBrowser {
  openUrl(url: string): Promise<void>;
  scrubSafari(keepPrefs?: boolean): Promise<void>;
  updateSafariSettings(updates: StringRecord): Promise<boolean>;
  getWebInspectorSocket(): Promise<string|null>;
}

interface KeyboardOptions {
  /** The name of the keyboard locale, for example `en_US` or `de_CH` */
  name: string;
  /** The keyboard layout, for example `QUERTY` or `Ukrainian` */
  layout: string;
  /** hardware Could either be `Automatic` or `null` */
  hardware?: string|null;
}

export interface LanguageOptions {
  /** The name of the language, for example `de` or `zh-Hant-CN` */
  name: string;
  /**
   * No Simulator services will be reset if this option is set to true.
   * See https://github.com/appium/appium/issues/19440 for more details
   */
  skipSyncUiDialogTranslation?: boolean;
}

export interface LocaleOptions {
  /** The name of the system locale, for example `de_CH` or `zh_CN` */
  name: string;
  /** Optional calendar format, for example `gregorian` or `persian` */
  calendar?: string;
}

export interface LocalizationOptions {
  keyboard?: KeyboardOptions;
  language?: LanguageOptions;
  locale?: LocaleOptions;
}

export interface HasSettings {
  setReduceMotion(reduceMotion: boolean): Promise<boolean>;
  setReduceTransparency(reduceTransparency: boolean): Promise<boolean>;
  updateSettings(domain: string, updates: StringRecord): Promise<boolean>;
  setAppearance(value: string): Promise<void>;
  getAppearance(): Promise<string>;
  disableKeyboardIntroduction(): Promise<boolean>;
  configureLocalization(opts?: LocalizationOptions): Promise<boolean>;
  setAutoFillPasswords(isEnabled: boolean): Promise<boolean>;
}

export interface CertificateOptions {
  /**
   * Whether to install the given
   * certificate into the Trusted Root store (`true`, the default value) or to the keychain (`false`)
   */
  isRoot?: boolean;
}

export interface HasMiscFeatures {
  shake(): Promise<void>;
  addCertificate(payload: string, opts?: CertificateOptions): Promise<boolean>;
  pushNotification(payload: StringRecord): Promise<void>;
}

export interface SimulatorLookupOptions {
  /** The name of the simulator platform, iOS by default */
  platform?: string;
  /** Set it to `false` in order to skip simulator existence verification. `true` by default */
  checkExistence?: boolean;
  /**
   * The full path to the devices set where
   * the current simulator is located. `null` value means that the default path is
   * used, which is usually `~/Library/Developer/CoreSimulator/Devices`
   */
  devicesSetPath?: string|null;
  /** The logger to use for the simulator class. A default logger will be created if not provided */
  logger?: AppiumLogger;
}

export type Simulator = CoreSimulator
  & InteractsWithSafariBrowser
  & InteractsWithApps
  & HasSettings
  & InteractsWithApps
  & SupportsBiometric
  & SupportsGeolocation
  & InteractsWithKeychain
  & SupportsAppPermissions
  & HasMiscFeatures;
