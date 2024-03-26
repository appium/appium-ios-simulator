import { fs, timing, util } from '@appium/support';
import { waitForCondition, retryInterval } from 'asyncbox';
import { getDeveloperRoot, SIMULATOR_APP_NAME} from './utils';
import { exec } from 'teen_process';
import defaultLog from './logger';
import EventEmitter from 'events';
import AsyncLock from 'async-lock';
import _ from 'lodash';
import path from 'path';
import B from 'bluebird';
import { getPath as getXcodePath } from 'appium-xcode';
import Simctl from 'node-simctl';
import * as appExtensions from './extensions/applications';
import * as biometricExtensions from './extensions/biometric';
import * as safariExtensions from './extensions/safari';
import * as keychainExtensions from './extensions/keychain';
import * as geolocationExtensions from './extensions/geolocation';
import * as settingsExtensions from './extensions/settings';
import * as permissionsExtensions from './extensions/permissions';
import * as miscExtensions from './extensions/misc';


const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const STARTUP_LOCK = new AsyncLock();
const UI_CLIENT_BUNDLE_ID = 'com.apple.iphonesimulator';
const STARTUP_TIMEOUT_MS = 120 * 1000;

/**
 * @typedef {import('./types').CoreSimulator} CoreSimulator
 * @typedef {import('./types').HasSettings} HasSettings
 * @typedef {import('./types').InteractsWithApps} InteractsWithApps
 * @typedef {import('./types').InteractsWithKeychain} InteractsWithKeychain
 * @typedef {import('./types').SupportsGeolocation} SupportsGeolocation
 * @typedef {import('./types').HasMiscFeatures} HasMiscFeatures
 * @typedef {import('./types').InteractsWithSafariBrowser} InteractsWithSafariBrowser
 * @typedef {import('./types').SupportsBiometric} SupportsBiometric
 */

/**
 * @implements {CoreSimulator}
 * @implements {HasSettings}
 * @implements {InteractsWithApps}
 * @implements {InteractsWithKeychain}
 * @implements {SupportsGeolocation}
 * @implements {HasMiscFeatures}
 * @implements {InteractsWithSafariBrowser}
 * @implements {SupportsBiometric}
 */
export class SimulatorXcode10 extends EventEmitter {
  /** @type {string|undefined|null} */
  _keychainsBackupPath;

  /** @type {string|undefined|null} */
  _platformVersion;

  /** @type {string|undefined|null} */
  _webInspectorSocket;

  /**
   * Constructs the object with the `udid` and version of Xcode. Use the exported `getSimulator(udid)` method instead.
   *
   * @param {string} udid - The Simulator ID.
   * @param {import('appium-xcode').XcodeVersion} xcodeVersion - The target Xcode version in format {major, minor, build}.
   * @param {import('@appium/types').AppiumLogger?} log
   */
  constructor (udid, xcodeVersion, log = null) {
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
    this._idb = null;
    this._webInspectorSocket = null;
    this._log = log ?? defaultLog;
  }

  /**
   * @returns {string}
   */
  get udid() {
    return this._udid;
  }

  /**
   * @returns {Simctl}
   */
  get simctl() {
    return this._simctl;
  }

  /**
   * @returns {import('appium-xcode').XcodeVersion}
   */
  get xcodeVersion() {
    return this._xcodeVersion;
  }

  /**
   * @returns {string}
   */
  get keychainPath() {
    return path.resolve(this.getDir(), 'Library', 'Keychains');
  }

  /**
   * @return {import('@appium/types').AppiumLogger}
   */
  get log() {
    return this._log;
  }

  /**
   * @return {string} Bundle identifier of Simulator UI client.
   */
  get uiClientBundleId () {
    return UI_CLIENT_BUNDLE_ID;
  }

  /**
   * @return {number} The max number of milliseconds to wait until Simulator booting is completed.
   */
  get startupTimeout () {
    return STARTUP_TIMEOUT_MS;
  }

  /**
   * @return {?string} The full path to the devices set where the current simulator is located.
   * `null` value means that the default path is used, which is usually `~/Library/Developer/CoreSimulator/Devices`
   */
  get devicesSetPath () {
    return this.simctl.devicesSetPath;
  }

  /**
   * Set the full path to the devices set. It is recommended to set this value
   * once right after Simulator instance is created and to not change it during
   * the instance lifecycle
   *
   * @param {?string} value The full path to the devices set root on the
   * local file system
   */
  set devicesSetPath (value) {
    this.simctl.devicesSetPath = value;
  }

  /**
   * IDB instance setter
   *
   * @param {any} value
   */
  set idb (value) {
    this._idb = value;
  }

  /**
   * @return {Promise<any>} idb instance
   */
  get idb () {
    return this._idb;
  }

  /**
   * Retrieve the full path to the directory where Simulator stuff is located.
   *
   * @return {string} The path string.
   */
  getRootDir () {
    return path.resolve(process.env.HOME ?? '', 'Library', 'Developer', 'CoreSimulator', 'Devices');
  }

  /**
   * Retrieve the full path to the directory where Simulator applications data is located.
   *
   * @return {string} The path string.
   */
  getDir () {
    return path.resolve(this.getRootDir(), this.udid, 'data');
  }

  /**
   * Retrieve the full path to the directory where Simulator logs are stored.
   *
   * @return {string} The path string.
   */
  getLogDir () {
    return path.resolve(process.env.HOME ?? '', 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  /**
   * Get the state and specifics of this sim.
   *
   * @return {Promise<import('./types').DeviceStat|import('@appium/types').StringRecord<never>>} Simulator stats mapping, for example:
   * { name: 'iPhone 4s',
   *   udid: 'C09B34E5-7DCB-442E-B79C-AB6BC0357417',
   *   state: 'Shutdown',
   *   sdk: '8.3'
   * }
   */
  async stat () {
    for (const [sdk, deviceArr] of _.toPairs(await this.simctl.getDevices())) {
      for (let device of deviceArr) {
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
   * and has not been erased before
   *
   * @return {Promise<boolean>} True if the current Simulator has never been started before
   */
  async isFresh () {
    const cachesRoot = path.resolve(this.getDir(), 'Library', 'Caches');
    return (await fs.exists(cachesRoot))
      ? (await fs.glob('*', {cwd: cachesRoot})).length === 0
      : true;
  }

  /**
   * Retrieves the state of the current Simulator. One should distinguish the
   * states of Simulator UI and the Simulator itself.
   *
   * @return {Promise<boolean>} True if the current Simulator is running.
   */
  async isRunning () {
    try {
      await this.simctl.getEnv('dummy');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Checks if the simulator is in shutdown state.
   * This method is necessary, because Simulator might also be
   * in the transitional Shutting Down state right after the `shutdown`
   * command has been issued.
   *
   * @return {Promise<boolean>} True if the current Simulator is shut down.
   */
  async isShutdown () {
    try {
      await this.simctl.getEnv('dummy');
      return false;
    } catch (e) {
      return _.includes(e.stderr, 'Current state: Shutdown');
    }
  }

  /**
   * Retrieves the current process id of the UI client
   *
   * @return {Promise<string|null>} The process ID or null if the UI client is not running
   */
  async getUIClientPid () {
    let stdout;
    try {
      ({stdout} = await exec('pgrep', ['-fn', `${SIMULATOR_APP_NAME}/Contents/MacOS/`]));
    } catch (e) {
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
   * @return {Promise<boolean>} True of if UI client is running or false otherwise.
   */
  async isUIClientRunning () {
    return !_.isNull(await this.getUIClientPid());
  }

  /**
   * Get the platform version of the current Simulator.
   *
   * @return {Promise<string>} SDK version, for example '8.3'.
   */
  async getPlatformVersion () {
    if (!this._platformVersion) {
      const {sdk} = await this.stat();
      this._platformVersion = sdk;
    }
    return /** @type {string} */ (this._platformVersion);
  }

  /**
   * Boots Simulator if not already booted.
   * Does nothing if it is already running.
   * This API does NOT wait until Simulator is fully booted.
   *
   * @throws {Error} If there was a failure while booting the Simulator.
   */
  async boot () {
    const bootEventsEmitter = new EventEmitter();
    await this.simctl.startBootMonitor({
      onError: (err) => bootEventsEmitter.emit('failure', err),
      onFinished: () => bootEventsEmitter.emit('finish'),
      shouldPreboot: true,
    });
    try {
      await new B((resolve, reject) => {
        // Historically this call was always asynchronous,
        // e.g. it was not waiting until Simulator is fully booted.
        // So we preserve that behavior, and if no errors are received for a while
        // then we assume the Simulator booting is still in progress.
        setTimeout(resolve, 3000);
        bootEventsEmitter.once('failure', (err) => {
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
   * @param {number} startupTimeout - the number of milliseconds to wait until booting is completed.
   */
  async waitForBoot (startupTimeout) {
    await this.simctl.startBootMonitor({timeout: startupTimeout});
  }

  /**
   * Reset the current Simulator to the clean state.
   * It is expected the simulator is in shutdown state when this API is called.
   */
  async clean () {
    this.log.info(`Cleaning simulator ${this.udid}`);
    await this.simctl.eraseDevice(10000);
  }

  /**
   * Delete the particular Simulator from devices list
   */
  async delete () {
    await this.simctl.deleteDevice();
  }

  /**
   * Shut down the current Simulator.
   *
   * @param {import('./types').ShutdownOptions} [opts={}]
   * @throws {Error} If Simulator fails to transition into Shutdown state after
   * the given timeout
   */
  async shutdown (opts = {}) {
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
      } catch (err) {
        throw new Error(`Simulator is not in 'Shutdown' state after ${waitMs}ms`);
      }
    }
  }

  /**
   * Boots simulator and opens simulators UI Client if not already opened.
   *
   * @param {boolean} isUiClientRunning - process id of simulator UI client.
   * @param {import('./types').RunOptions} [opts={}] - arguments to start simulator UI client with.
   */
  async launchWindow (isUiClientRunning, opts = {}) {
    await this.boot();
    if (!isUiClientRunning) {
      await this.startUIClient(opts);
    }
  }

  /**
   * Start the Simulator UI client with the given arguments
   *
   * @param {import('./types').StartUiClientOptions} [opts={}] - Simulator startup options
   */
  async startUIClient (opts = {}) {
    opts = _.cloneDeep(opts);
    _.defaultsDeep(opts, {
      startupTimeout: this.startupTimeout,
    });

    const simulatorApp = path.resolve(await getXcodePath(), 'Applications', SIMULATOR_APP_NAME);
    const args = ['-Fn', simulatorApp];
    this.log.info(`Starting Simulator UI: ${util.quote(['open', ...args])}`);
    try {
      await exec('open', args, {timeout: opts.startupTimeout});
    } catch (err) {
      throw new Error(`Got an unexpected error while opening Simulator UI: ` +
        err.stderr || err.stdout || err.message);
    }
  }

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running and the current UI state matches to `isHeadless` option.
   *
   * @param {import('./types').RunOptions} [opts={}] - One or more of available Simulator options
   */
  async run (opts = {}) {
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
        } catch (e) {
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
      } catch (e) {
        this.log.info(`Cannot disable Simulator keyboard introduction. Original error: ${e.message}`);
      }
    })();
  }

  /**
   * Kill the UI client if it is running.
   *
   * @param {import('./types').KillUiClientOptions} [opts={}]
   * @return {Promise<boolean>} True if the UI client was successfully killed or false
   *                   if it is not running.
   * @throws {Error} If sending the signal to the client process fails
   */
  async killUIClient (opts = {}) {
    let {
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
    } catch (e) {
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
   * @return {Promise<import('./types').ProcessInfo[]>} The list of retrieved process
   * information
   * @throws {Error} if no process information could be retrieved.
   */
  async ps () {
    const {stdout} = await this.simctl.spawnProcess([
      'launchctl',
      'print',
      'system',
    ]);

    const servicesMatch = /^\s*services\s*=\s*{([^}]+)/m.exec(stdout);
    if (!servicesMatch) {
      this.log.debug(stdout);
      throw new Error(`The list of active processes cannot be retrieved`);
    }
    /*
    Example match:
        0     78 	com.apple.resourcegrabberd
    82158      - 	com.apple.assistant_service
    82120      - 	com.apple.nanoregistryd
    82087      - 	com.apple.notifyd
    82264      - 	UIKitApplication:com.apple.Preferences[704b][rb-legacy]
    */
    /** @type {import('./types').ProcessInfo[]} */
    const result = [];
    const pattern = /^\s*(\d+)\s+[\d-]+\s+([\w\-.]+:)?([\w\-.]+)/gm;
    let match;
    while ((match = pattern.exec(servicesMatch[1]))) {
      result.push({
        pid: parseInt(match[1], 10),
        group: _.trimEnd(match[2], ':') || null,
        name: match[3],
      });
    }
    return result;
  }

  /**
   * @returns {Promise<string>}
   */
  async getLaunchDaemonsRoot () {
    const devRoot = await getDeveloperRoot();
    return path.resolve(devRoot,
      'Platforms/iPhoneOS.platform/Developer/Library/CoreSimulator/Profiles/Runtimes/iOS.simruntime/Contents/Resources/RuntimeRoot/System/Library/LaunchDaemons');
  }

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
  getWebInspectorSocket = /** @type {() => Promise<string|null>} */ (
    /** @type {unknown} */ (safariExtensions.getWebInspectorSocket)
  );

  isBiometricEnrolled = biometricExtensions.isBiometricEnrolled;
  enrollBiometric = biometricExtensions.enrollBiometric;
  sendBiometricMatch = biometricExtensions.sendBiometricMatch;

  setGeolocation = geolocationExtensions.setGeolocation;

  backupKeychains = /** @type {() => Promise<boolean>} */ (
    /** @type {unknown} */ (keychainExtensions.backupKeychains)
  );
  restoreKeychains = /** @type {() => Promise<boolean>} */ (
    /** @type {unknown} */ (keychainExtensions.restoreKeychains)
  );
  clearKeychains = keychainExtensions.clearKeychains;

  shake = miscExtensions.shake;
  addCertificate = miscExtensions.addCertificate;
  pushNotification = miscExtensions.pushNotification;

  setPermission = permissionsExtensions.setPermission;
  setPermissions = permissionsExtensions.setPermissions;
  getPermission = permissionsExtensions.getPermission;

  updateSettings = settingsExtensions.updateSettings;
  setAppearance = settingsExtensions.setAppearance;
  getAppearance = settingsExtensions.getAppearance;
  configureLocalization = settingsExtensions.configureLocalization;
  setAutoFillPasswords = settingsExtensions.setAutoFillPasswords;
  setReduceMotion = settingsExtensions.setReduceMotion;
  setReduceTransparency = settingsExtensions.setReduceTransparency;
  disableKeyboardIntroduction = settingsExtensions.disableKeyboardIntroduction;
}
