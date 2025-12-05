import { fs, timing, util } from '@appium/support';
import { waitForCondition, retryInterval } from 'asyncbox';
import { getDeveloperRoot, SIMULATOR_APP_NAME} from './utils';
import { exec } from 'teen_process';
import { log as defaultLog } from './logger';
import EventEmitter from 'events';
import AsyncLock from 'async-lock';
import _ from 'lodash';
import path from 'node:path';
import B from 'bluebird';
import { getPath as getXcodePath } from 'appium-xcode';
import { Simctl } from 'node-simctl';
import * as appExtensions from './extensions/applications';
import * as biometricExtensions from './extensions/biometric';
import * as safariExtensions from './extensions/safari';
import * as keychainExtensions from './extensions/keychain';
import * as settingsExtensions from './extensions/settings';
import * as permissionsExtensions from './extensions/permissions';
import * as miscExtensions from './extensions/misc';
import type {
  CoreSimulator,
  HasSettings,
  InteractsWithApps,
  InteractsWithKeychain,
  SupportsGeolocation,
  HasMiscFeatures,
  InteractsWithSafariBrowser,
  SupportsBiometric,
  DeviceStat,
  ShutdownOptions,
  RunOptions,
  StartUiClientOptions,
  KillUiClientOptions,
  ProcessInfo,
  CertificateOptions,
} from './types';
import type { XcodeVersion } from 'appium-xcode';
import type { AppiumLogger, StringRecord } from '@appium/types';

const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const STARTUP_LOCK = new AsyncLock();
const UI_CLIENT_BUNDLE_ID = 'com.apple.iphonesimulator';
const STARTUP_TIMEOUT_MS = 120 * 1000;

export class SimulatorXcode14 extends EventEmitter implements
  CoreSimulator,
  HasSettings,
  InteractsWithApps,
  InteractsWithKeychain,
  SupportsGeolocation,
  HasMiscFeatures,
  InteractsWithSafariBrowser,
  SupportsBiometric {
  _keychainsBackupPath: string | null | undefined;
  _platformVersion: string | null | undefined;
  _webInspectorSocket: string | null | undefined;
  private readonly _udid: string;
  private readonly _simctl: Simctl;
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
    this._simctl = new Simctl({
      udid: this._udid,
    });
    this._xcodeVersion = xcodeVersion;
    // platformVersion cannot be found initially, since getting it has side effects for
    // our logic for figuring out if a sim has been run
    // it will be set when it is needed
    this._platformVersion = null;
    this._webInspectorSocket = null;
    this._log = log ?? defaultLog;
  }

  /**
   * @returns The unique device identifier (UDID) of the simulator.
   */
  get udid(): string {
    return this._udid;
  }

  /**
   * @returns The Simctl instance for interacting with the simulator.
   */
  get simctl(): Simctl {
    return this._simctl;
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
    return UI_CLIENT_BUNDLE_ID;
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
    return this.simctl.devicesSetPath;
  }

  /**
   * Set the full path to the devices set. It is recommended to set this value
   * once right after Simulator instance is created and to not change it during
   * the instance lifecycle.
   *
   * @param value - The full path to the devices set root on the local file system.
   */
  set devicesSetPath(value: string | null) {
    this.simctl.devicesSetPath = value;
  }

  /**
   * Retrieve the full path to the directory where Simulator stuff is located.
   *
   * @returns The path string.
   */
  getRootDir(): string {
    return path.resolve(process.env.HOME ?? '', 'Library', 'Developer', 'CoreSimulator', 'Devices');
  }

  /**
   * Retrieve the full path to the directory where Simulator applications data is located.
   *
   * @returns The path string.
   */
  getDir(): string {
    return path.resolve(this.getRootDir(), this.udid, 'data');
  }

  /**
   * Retrieve the full path to the directory where Simulator logs are stored.
   *
   * @returns The path string.
   */
  getLogDir(): string {
    return path.resolve(process.env.HOME ?? '', 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  /**
   * Get the state and specifics of this simulator.
   *
   * @returns Simulator stats mapping, for example:
   * { name: 'iPhone 4s',
   *   udid: 'C09B34E5-7DCB-442E-B79C-AB6BC0357417',
   *   state: 'Shutdown',
   *   sdk: '8.3'
   * }
   */
  async stat(): Promise<DeviceStat | StringRecord<never>> {
    const devices = await this.simctl.getDevices();
    for (const [sdk, deviceArr] of _.toPairs(devices)) {
      for (const device of deviceArr as any[]) {
        if (device.udid === this.udid) {
          device.sdk = sdk;
          return device;
        }
      }
    }

    return {};
  }

  /**
   * Check if the Simulator has been booted at least once
   * and has not been erased before.
   *
   * @returns True if the current Simulator has never been started before.
   */
  async isFresh(): Promise<boolean> {
    const cachesRoot = path.resolve(this.getDir(), 'Library', 'Caches');
    return (await fs.exists(cachesRoot))
      ? (await fs.glob('*', {cwd: cachesRoot})).length === 0
      : true;
  }

  /**
   * Retrieves the state of the current Simulator. One should distinguish the
   * states of Simulator UI and the Simulator itself.
   *
   * @returns True if the current Simulator is running.
   */
  async isRunning(): Promise<boolean> {
    try {
      await this.simctl.getEnv('dummy');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the simulator is in shutdown state.
   * This method is necessary, because Simulator might also be
   * in the transitional Shutting Down state right after the `shutdown`
   * command has been issued.
   *
   * @returns True if the current Simulator is shut down.
   */
  async isShutdown(): Promise<boolean> {
    try {
      await this.simctl.getEnv('dummy');
      return false;
    } catch (e: any) {
      return _.includes(e.stderr, 'Current state: Shutdown');
    }
  }

  /**
   * Retrieves the current process id of the UI client.
   *
   * @returns The process ID or null if the UI client is not running.
   */
  async getUIClientPid(): Promise<string | null> {
    let stdout: string;
    try {
      ({stdout} = await exec('pgrep', ['-fn', `${SIMULATOR_APP_NAME}/Contents/MacOS/`]));
    } catch {
      return null;
    }
    if (isNaN(parseInt(stdout, 10))) {
      return null;
    }
    stdout = stdout.trim();
    this.log.debug(`Got Simulator UI client PID: ${stdout}`);
    return stdout;
  }

  /**
   * Check the state of Simulator UI client.
   *
   * @returns True if UI client is running or false otherwise.
   */
  async isUIClientRunning(): Promise<boolean> {
    return !_.isNull(await this.getUIClientPid());
  }

  /**
   * Get the platform version of the current Simulator.
   *
   * @returns SDK version, for example '18.3'.
   */
  async getPlatformVersion(): Promise<string> {
    if (!this._platformVersion) {
      const stat = await this.stat();
      this._platformVersion = 'sdk' in stat ? stat.sdk : '';
    }
    return this._platformVersion as string;
  }

  /**
   * Boots Simulator if not already booted.
   * Does nothing if it is already running.
   * This API does NOT wait until Simulator is fully booted.
   *
   * @throws {Error} If there was a failure while booting the Simulator.
   */
  async boot(): Promise<void> {
    const bootEventsEmitter = new EventEmitter();
    await this.simctl.startBootMonitor({
      onError: (err: Error) => bootEventsEmitter.emit('failure', err),
      onFinished: () => bootEventsEmitter.emit('finish'),
      shouldPreboot: true,
    });
    try {
      await new B<void>((resolve, reject) => {
        // Historically this call was always asynchronous,
        // e.g. it was not waiting until Simulator is fully booted.
        // So we preserve that behavior, and if no errors are received for a while
        // then we assume the Simulator booting is still in progress.
        setTimeout(resolve, 3000);
        bootEventsEmitter.once('failure', (err: Error) => {
          if (_.includes(err?.message, 'state: Booted')) {
            resolve();
          } else {
            reject(err);
          }
        });
        bootEventsEmitter.once('finish', resolve);
      });
    } finally {
      bootEventsEmitter.removeAllListeners();
    }
  }

  /**
   * Verify whether the Simulator booting is completed and/or wait for it
   * until the timeout expires.
   *
   * @param startupTimeout - The number of milliseconds to wait until booting is completed.
   */
  async waitForBoot(startupTimeout: number): Promise<void> {
    await this.simctl.startBootMonitor({timeout: startupTimeout});
  }

  /**
   * Reset the current Simulator to the clean state.
   * It is expected the simulator is in shutdown state when this API is called.
   */
  async clean(): Promise<void> {
    this.log.info(`Cleaning simulator ${this.udid}`);
    await this.simctl.eraseDevice(10000);
  }

  /**
   * Delete the particular Simulator from devices list.
   */
  async delete(): Promise<void> {
    await this.simctl.deleteDevice();
  }

  /**
   * Shut down the current Simulator.
   *
   * @param opts - Shutdown options including timeout.
   * @throws {Error} If Simulator fails to transition into Shutdown state after
   * the given timeout.
   */
  async shutdown(opts: ShutdownOptions = {}): Promise<void> {
    if (await this.isShutdown()) {
      return;
    }

    await retryInterval(5, 500, this.simctl.shutdownDevice.bind(this.simctl));
    const waitMs = parseInt(`${opts.timeout ?? 0}`, 10);
    if (waitMs > 0) {
      try {
        await waitForCondition(async () => await this.isShutdown(), {
          waitMs,
          intervalMs: 100,
        });
      } catch {
        throw new Error(`Simulator is not in 'Shutdown' state after ${waitMs}ms`);
      }
    }
  }

  /**
   * Boots simulator and opens simulators UI Client if not already opened.
   * In xcode 11.4, UI Client must be first launched, otherwise
   * sim window stays minimized
   *
   * @param isUiClientRunning - whether the simulator UI client is already running.
   * @param opts - arguments to start simulator UI client with.
   */
  async launchWindow(isUiClientRunning: boolean, opts: RunOptions = {}): Promise<void> {
    // In xcode 11.4, UI Client must be first launched, otherwise
    // sim window stays minimized
    if (!isUiClientRunning) {
      await this.startUIClient(opts);
    }
    await this.boot();
  }

  /**
   * Start the Simulator UI client with the given arguments.
   *
   * @param opts - Simulator startup options.
   */
  async startUIClient(opts: StartUiClientOptions = {}): Promise<void> {
    opts = _.cloneDeep(opts);
    _.defaultsDeep(opts, {
      startupTimeout: this.startupTimeout,
    });

    const simulatorApp = path.resolve(await getXcodePath(), 'Applications', SIMULATOR_APP_NAME);
    const args = ['-Fn', simulatorApp];
    this.log.info(`Starting Simulator UI: ${util.quote(['open', ...args])}`);
    try {
      await exec('open', args, {timeout: opts.startupTimeout});
    } catch (err: any) {
      throw new Error(`Got an unexpected error while opening Simulator UI: ` +
        err.stderr || err.stdout || err.message);
    }
  }

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running and the current UI state matches to `isHeadless` option.
   *
   * @param opts - One or more of available Simulator options.
   */
  async run(opts: RunOptions = {}): Promise<void> {
    opts = _.cloneDeep(opts);
    _.defaultsDeep(opts, {
      isHeadless: false,
      startupTimeout: this.startupTimeout,
    });

    const [devicePreferences, commonPreferences] = settingsExtensions.compileSimulatorPreferences.bind(this)(opts);
    await settingsExtensions.updatePreferences.bind(this)(devicePreferences, commonPreferences);

    const timer = new timing.Timer().start();
    const shouldWaitForBoot = await STARTUP_LOCK.acquire(this.uiClientBundleId, async () => {
      const isServerRunning = await this.isRunning();
      const uiClientPid = await this.getUIClientPid();
      if (opts.isHeadless) {
        if (isServerRunning && !uiClientPid) {
          this.log.info(`Simulator with UDID '${this.udid}' is already booted in headless mode.`);
          return false;
        }
        if (await this.killUIClient({pid: uiClientPid})) {
          this.log.info(`Detected the Simulator UI client was running and killed it. Verifying the current Simulator state`);
        }
        try {
          // Stopping the UI client kills all running servers for some early XCode versions. This is a known bug
          await waitForCondition(async () => await this.isShutdown(), {
            waitMs: 5000,
            intervalMs: 100,
          });
        } catch {
          if (!await this.isRunning()) {
            throw new Error(`Simulator with UDID '${this.udid}' cannot be transitioned to headless mode`);
          }
          return false;
        }
        this.log.info(`Booting Simulator with UDID '${this.udid}' in headless mode. ` +
          `All UI-related capabilities are going to be ignored`);
        await this.boot();
      } else {
        if (isServerRunning && uiClientPid) {
          this.log.info(`Both Simulator with UDID '${this.udid}' and the UI client are currently running`);
          return false;
        }
        if (isServerRunning) {
          this.log.info(`Simulator '${this.udid}' is booted while its UI is not visible. ` +
            `Trying to restart it with the Simulator window visible`);
          await this.shutdown({timeout: SIMULATOR_SHUTDOWN_TIMEOUT});
        }
        await this.launchWindow(Boolean(uiClientPid), opts);
      }
      return true;
    });

    if (shouldWaitForBoot && opts.startupTimeout) {
      await this.waitForBoot(opts.startupTimeout);
      this.log.info(`Simulator with UDID ${this.udid} booted in ${timer.getDuration().asSeconds.toFixed(3)}s`);
    }

    (async () => {
      try {
        await this.disableKeyboardIntroduction();
      } catch (e: any) {
        this.log.info(`Cannot disable Simulator keyboard introduction. Original error: ${e.message}`);
      }
    })();
  }

  /**
   * Kill the UI client if it is running.
   *
   * @param opts - Options including process ID and signal number.
   * @returns True if the UI client was successfully killed or false
   *                   if it is not running.
   * @throws {Error} If sending the signal to the client process fails.
   */
  async killUIClient(opts: KillUiClientOptions = {}): Promise<boolean> {
    const {
      pid,
      signal = 2,
    } = opts;
    const clientPid = pid || await this.getUIClientPid();
    if (!clientPid) {
      return false;
    }

    this.log.debug(`Sending ${signal} kill signal to Simulator UI client with PID ${clientPid}`);
    try {
      await exec('kill', [`-${signal}`, `${clientPid}`]);
      return true;
    } catch (e: any) {
      if (e.code === 1) {
        return false;
      }
      throw new Error(`Cannot kill the Simulator UI client. Original error: ${e.message}`);
    }
  }

  /**
   * Lists processes that are currently running on the given Simulator.
   * The simulator must be in running state in order for this
   * method to work properly.
   *
   * @returns The list of retrieved process information.
   * @throws {Error} If no process information could be retrieved.
   */
  async ps(): Promise<ProcessInfo[]> {
    const {stdout} = await this.simctl.spawnProcess([
      'launchctl', 'list'
    ]);
    /*
    Example match:
      PID	Status	Label
      -	0	com.apple.progressd
      22109	0	com.apple.CoreAuthentication.daemon
      21995	0	com.apple.cloudphotod
      22045	0	com.apple.homed
      22042	0	com.apple.dataaccess.dataaccessd
      -	0	com.apple.DragUI.druid
      22076	0	UIKitApplication:com.apple.mobilesafari[2b0f][rb-legacy]
    */
    const extractGroup = (lbl: string): string | null => lbl.includes(':') ? lbl.split(':')[0] : null;
    const extractName = (lbl: string): string => {
      let res = lbl;
      const colonIdx = res.indexOf(':');
      if (colonIdx >= 0 && res.length > colonIdx) {
        res = res.substring(colonIdx + 1);
      }
      const bracketIdx = res.indexOf('[');
      if (bracketIdx >= 0) {
        res = res.substring(0, bracketIdx);
      }
      return res;
    };

    const result: ProcessInfo[] = [];
    for (const line of stdout.split('\n')) {
      const trimmedLine = _.trim(line);
      if (!trimmedLine) {
        continue;
      }

      const [pidStr,, label] = trimmedLine.split(/\s+/);
      const pid = parseInt(pidStr, 10);
      if (!pid || !label) {
        continue;
      }

      result.push({
        pid,
        group: extractGroup(label),
        name: extractName(label),
      });
    }
    return result;
  }

  /**
   * @returns The full path to the LaunchDaemons directory.
   */
  async getLaunchDaemonsRoot(): Promise<string> {
    const devRoot = await getDeveloperRoot();
    return path.resolve(
      devRoot,
      'Platforms',
      'iPhoneOS.platform',
      'Library',
      'Developer',
      'CoreSimulator',
      'Profiles',
      'Runtimes',
      'iOS.simruntime',
      'Contents',
      'Resources',
      'RuntimeRoot',
      'System',
      'Library',
      'LaunchDaemons'
    );
  }

  /**
   * Sets the geolocation for the simulator.
   *
   * @param latitude - The latitude coordinate.
   * @param longitude - The longitude coordinate.
   * @returns True if the geolocation was set successfully.
   */
  setGeolocation = async (latitude: string | number, longitude: string | number): Promise<boolean> => {
    await this.simctl.setLocation(latitude, longitude);
    return true;
  };

  /**
   * Clears Keychains for the particular simulator in runtime (there is no need to stop it).
   *
   * @returns
   * @throws {Error} If keychain cleanup has failed.
   */
  clearKeychains = async (): Promise<void> => {
    await this.simctl.resetKeychain();
  };

  /**
   * Adds the given certificate to the booted simulator.
   * The simulator could be in both running and shutdown states
   * in order for this method to run as expected.
   *
   * @since Xcode 11.4
   * @param payload the content of the PEM certificate
   * @param opts Certificate options
   * @returns True if the certificate was added successfully.
   */
  addCertificate = async (payload: string, opts: CertificateOptions = {}): Promise<boolean> => {
    const {
      isRoot = true,
    } = opts;
    const methodName = isRoot ? 'addRootCertificate' : 'addCertificate';
    await this.simctl[methodName](payload, {raw: true});
    return true;
  };

  /**
   * Simulates push notification delivery to the booted simulator
   *
   * @since Xcode SDK 11.4
   * @param payload - The object that describes Apple push notification content.
   * It must contain a top-level "Simulator Target Bundle" key with a string value matching
   * the target application's bundle identifier and "aps" key with valid Apple Push Notification values.
   * For example:
   * {
   *   "Simulator Target Bundle": "com.apple.Preferences",
   *   "aps": {
   *     "alert": "This is a simulated notification!",
   *     "badge": 3,
   *     "sound": "default"
   *   }
   * }
   */
  pushNotification = async (payload: StringRecord): Promise<void> => {
    await this.simctl.pushNotification(payload);
  };

  /**
   * Sets UI appearance style.
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   * @param value one of possible appearance values:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   */
  setAppearance = async (value: string): Promise<void> => {
    await this.simctl.setAppearance(_.toLower(value));
  };

  /**
   * Gets the current UI appearance style
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   * @returns the current UI appearance style.
   * Possible values are:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   */
  getAppearance = async (): Promise<string> => await this.simctl.getAppearance();

  // Extension methods
  installApp = appExtensions.installApp;
  getUserInstalledBundleIdsByBundleName = appExtensions.getUserInstalledBundleIdsByBundleName;
  isAppInstalled = appExtensions.isAppInstalled;
  removeApp = appExtensions.removeApp;
  launchApp = appExtensions.launchApp;
  terminateApp = appExtensions.terminateApp;
  isAppRunning = appExtensions.isAppRunning;
  scrubApp = appExtensions.scrubApp;

  openUrl = safariExtensions.openUrl;
  scrubSafari = safariExtensions.scrubSafari;
  updateSafariSettings = safariExtensions.updateSafariSettings;
  getWebInspectorSocket = safariExtensions.getWebInspectorSocket as unknown as () => Promise<string | null>;

  isBiometricEnrolled = biometricExtensions.isBiometricEnrolled;
  enrollBiometric = biometricExtensions.enrollBiometric;
  sendBiometricMatch = biometricExtensions.sendBiometricMatch;

  backupKeychains = keychainExtensions.backupKeychains as unknown as () => Promise<boolean>;
  restoreKeychains = keychainExtensions.restoreKeychains as unknown as (excludePatterns: string[]) => Promise<boolean>;

  shake = miscExtensions.shake;

  setPermission = permissionsExtensions.setPermission;
  setPermissions = permissionsExtensions.setPermissions;
  getPermission = permissionsExtensions.getPermission;

  updateSettings = settingsExtensions.updateSettings;
  setIncreaseContrast = settingsExtensions.setIncreaseContrast;
  getIncreaseContrast = settingsExtensions.getIncreaseContrast;
  setContentSize = settingsExtensions.setContentSize;
  getContentSize = settingsExtensions.getContentSize;
  configureLocalization = settingsExtensions.configureLocalization;
  setAutoFillPasswords = settingsExtensions.setAutoFillPasswords;
  setReduceMotion = settingsExtensions.setReduceMotion;
  setReduceTransparency = settingsExtensions.setReduceTransparency;
  disableKeyboardIntroduction = settingsExtensions.disableKeyboardIntroduction;
}

