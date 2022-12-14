import _ from 'lodash';
import log from './logger';
import { exec } from 'teen_process';
import { activateApp, SIMULATOR_APP_NAME } from './utils';
import path from 'path';
import { getPath as getXcodePath } from 'appium-xcode';
import { fs, timing } from '@appium/support';
import AsyncLock from 'async-lock';
import { retryInterval, waitForCondition } from 'asyncbox';
import { EventEmitter } from 'events';
import Simctl from 'node-simctl';
import extensions from './extensions/index';

/*
 * This event is emitted as soon as iOS Simulator
 * has finished booting and it is ready to accept xcrun commands.
 * The event handler is called after 'run' method is completed
 * for Xcode 7 and older and is only useful in Xcode 8+,
 * since one can start doing stuff (for example install/uninstall an app) in parallel
 * with Simulator UI startup, which shortens session startup time.
 */
const BOOT_COMPLETED_EVENT = 'bootCompleted';

const STARTUP_TIMEOUT_MS = 120 * 1000;
const UI_CLIENT_ACCESS_GUARD = new AsyncLock();
const UI_CLIENT_BUNDLE_ID = 'com.apple.iphonesimulator';


class SimulatorXcode8 extends EventEmitter {
  /**
   * Constructs the object with the `udid` and version of Xcode. Use the exported `getSimulator(udid)` method instead.
   *
   * @param {string} udid - The Simulator ID.
   * @param {object} xcodeVersion - The target Xcode version in format {major, minor, build}.
   */
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    this.udid = String(udid);
    this.simctl = new Simctl({
      udid: this.udid,
    });
    this.xcodeVersion = xcodeVersion;

    // platformVersion cannot be found initially, since getting it has side effects for
    // our logic for figuring out if a sim has been run
    // it will be set when it is needed
    this._platformVersion = null;

    this.keychainPath = path.resolve(this.getDir(), 'Library', 'Keychains');
    this._idb = null;

    // for setting the location using AppleScript, the top-level menu through which
    // the 'Location' option is found
    this._locationMenu = 'Debug';
  }

  /**
   * @return {string} Bundle identifier of Simulator UI client.
   */
  get uiClientBundleId () {
    return UI_CLIENT_BUNDLE_ID;
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
   * Retrieves the current process id of the UI client
   *
   * @return {?string} The process ID or null if the UI client is not running
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
    log.debug(`Got Simulator UI client PID: ${stdout}`);
    return stdout;
  }

  /**
   * Check the state of Simulator UI client.
   *
   * @return {boolean} True of if UI client is running or false otherwise.
   */
  async isUIClientRunning () {
    return !_.isNull(await this.getUIClientPid());
  }

  /**
   * Get the platform version of the current Simulator.
   *
   * @return {string} SDK version, for example '8.3'.
   */
  async getPlatformVersion () {
    if (!this._platformVersion) {
      const {sdk} = await this.stat();
      this._platformVersion = sdk;
    }
    return this._platformVersion;
  }

  /**
   * Retrieve the full path to the directory where Simulator stuff is located.
   *
   * @return {string} The path string.
   */
  getRootDir () {
    return path.resolve(process.env.HOME, 'Library', 'Developer', 'CoreSimulator', 'Devices');
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
    return path.resolve(process.env.HOME, 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  /**
   * Get the state and specifics of this sim.
   *
   * @return {object} Simulator stats mapping, for example:
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
   * @return {boolean} True if the current Simulator has never been started before
   */
  async isFresh () {
    const cachesRoot = path.resolve(this.getDir(), 'Library', 'Caches');
    return (await fs.exists(cachesRoot))
      ? (await fs.glob('*', {cwd: cachesRoot, nosort: true, strict: false})).length === 0
      : true;
  }

  /**
   * Retrieves the state of the current Simulator. One should distinguish the
   * states of Simulator UI and the Simulator itself.
   *
   * @return {boolean} True if the current Simulator is running.
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
   * @return {boolean} True if the current Simulator is shut down.
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
   * @typedef {Object} SimulatorOptions
   * @property {?string} scaleFactor [null] - Defines the window scale value for the UI client window for the current Simulator.
   *   Equals to null by default, which keeps the current scale unchanged.
   *   It should be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   * @property {number} startupTimeout [60000] - Number of milliseconds to wait until Simulator booting
   *   process is completed. The default timeout will be used if not set explicitly.
   */

  /**
   * Start the Simulator UI client with the given arguments
   * @param {SimulatorOptions} opts - Simulator startup options
   */
  async startUIClient (opts = {}) {
    opts = _.cloneDeep(opts);
    _.defaultsDeep(opts, {
      scaleFactor: null,
      startupTimeout: this.startupTimeout,
    });

    const simulatorApp = path.resolve(await getXcodePath(), 'Applications', SIMULATOR_APP_NAME);
    const args = [
      '-Fn', simulatorApp,
      '--args', '-CurrentDeviceUDID', this.udid,
    ];

    if (opts.scaleFactor) {
      const {name} = await this.stat();
      const formattedDeviceName = name.replace(/\s+/g, '-');
      const argumentName = `-SimulatorWindowLastScale-com.apple.CoreSimulator.SimDeviceType.${formattedDeviceName}`;
      args.push(argumentName, opts.scaleFactor);
    }

    log.info(`Starting Simulator UI with command: open ${args.join(' ')}`);
    try {
      await exec('open', args, {timeout: opts.startupTimeout});
    } catch (err) {
      if (!(err.stdout || '').includes('-10825') && !(err.stderr || '').includes('-10825')) {
        throw err;
      }
      log.warn(`Error while opening UI: ${err.stdout || err.stderr}. Continuing`);
    }
  }

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running.
   *
   * @param {object} opts - One or more of available Simulator options.
   *   See {#startUIClient(opts)} documentation for more details on other supported keys.
   */
  async run (opts = {}) {
    opts = Object.assign({
      startupTimeout: this.startupTimeout,
    }, opts);
    const isServerRunning = await this.isRunning();
    const isUIClientRunning = await this.isUIClientRunning();
    if (isServerRunning && isUIClientRunning) {
      log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
      return;
    }
    const timer = new timing.Timer().start();
    try {
      await this.shutdown();
    } catch (err) {
      log.warn(`Error on Simulator shutdown: ${err.message}`);
    }
    await this.startUIClient(opts);

    await this.waitForBoot(opts.startupTimeout);
    log.info(`Simulator with UDID ${this.udid} booted in ${timer.getDuration().asSeconds.toFixed(3)}s`);
  }

  /**
   * Reset the current Simulator to the clean state.
   * It is expected the simulator is in shutdown state when this API is called.
   */
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await this.simctl.eraseDevice(10000);
  }

  /**
   * @typedef {Object} ShutdownOptions
   * @property {?number|string} timeout The number of milliseconds to wait until
   * Simulator is shut down completely. No wait happens if the timeout value is not set
   */

  /**
   * Shut down the current Simulator.
   *
   * @param {?ShutdownOptions} opts
   * @throws {Error} If Simulator fails to transition into Shutdown state after
   * the given timeout
   */
  async shutdown (opts = {}) {
    if (await this.isShutdown()) {
      return;
    }

    await retryInterval(5, 500, this.simctl.shutdownDevice.bind(this.simctl));
    const waitMs = parseInt(opts.timeout, 10);
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
   * Delete the particular Simulator from devices list
   */
  async delete () {
    await this.simctl.deleteDevice();
  }

  /**
   * Activates Simulator window.
   *
   * @private
   * @returns {?string} If the method returns a string then it should be a valid Apple Script which
   * is appended before each UI client command is executed. Otherwise the method should activate the window
   * itself and return nothing.
   */
  async _activateWindow () { // eslint-disable-line require-await
    const pid = await this.getUIClientPid();
    if (pid) {
      try {
        return await activateApp(pid);
      } catch (e) {
        log.debug(e.stderr || e.message);
      }
    }
    return `
      tell application "System Events"
        tell process "Simulator"
          set frontmost to false
          set frontmost to true
        end tell
      end tell
    `;
  }

  /**
   * Execute given Apple Script inside a critical section, so other
   * sessions cannot influence the UI client at the same time.
   *
   * @param {string} appleScript - The valid Apple Script snippet to be executed.
   * @return {string} The stdout output produced by the script.
   * @throws {Error} If osascript tool returns non-zero exit code.
   */
  async executeUIClientScript (appleScript) {
    const windowActivationScript = await this._activateWindow();
    const resultScript = `${windowActivationScript ? windowActivationScript + '\n' : ''}${appleScript}`;
    log.debug(`Executing UI Apple Script on Simulator with UDID ${this.udid}: ${resultScript}`);
    return await UI_CLIENT_ACCESS_GUARD.acquire(SIMULATOR_APP_NAME, async () => {
      try {
        const {stdout} = await exec('osascript', ['-e', resultScript]);
        return stdout;
      } catch (err) {
        log.errorAndThrow(
          `Could not complete operation. Make sure Simulator UI is running and the parent Appium application (e. g. Appium.app or Terminal.app) ` +
          `is present in System Preferences > Security & Privacy > Privacy > Accessibility list. If the operation is still unsuccessful then ` +
          `it is not supported by this Simulator. Original error: ${err.message}`
        );
      }
    });
  }

  /**
   * @typedef {Object} ProcessInfo
   * @property {number} pid The actual process identifier.
   * Could be zero if the process is the system one.
   * @property {?string} group The process group identifier.
   * This could be `null` if the process is not a part of the
   * particular group. For `normal` application processes the group
   * name usually equals to `UIKitApplication`.
   * @property {string} name The process name, for example
   * `com.apple.Preferences`
   */

  /**
   * Lists processes that are currently running on the given Simulator.
   * The simulator must be in running state in order for this
   * method to work properly.
   *
   * @return {Array<ProcessInfo>} The list of retrieved process
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
      log.debug(stdout);
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
   * @return {?string} The full path to the simulator's WebInspector Unix Domain Socket
   *   or `null` if there is no socket.
   */
  async getWebInspectorSocket () { // eslint-disable-line require-await
    // there is no WebInspector socket for this version of Xcode
    return null;
  }

  /**
   * IDB instance setter
   *
   * @param {IDB} value
   */
  set idb (value) {
    this._idb = value;
  }

  /**
   * @return {IDB} idb instance
   */
  get idb () {
    return this._idb;
  }

  /**
   * @typedef {Object} killOpts
   * @property {?number|string} pid - Process id of the UI Simulator window
   * @property {number|string} signal [2] - The signal number to send to the
   * `kill` command
   */

  /**
   * Kill the UI client if it is running.
   *
   * @param {?killOpts} opts
   * @return {boolean} True if the UI client was successfully killed or false
   *                   if it is not running.
   * @throws {Error} If sending the signal to the client process fails
   */
  async killUIClient (opts = {}) {
    let {
      pid,
      signal = 2,
    } = opts;
    pid = pid || await this.getUIClientPid();
    if (!pid) {
      return false;
    }

    log.debug(`Sending ${signal} kill signal to Simulator UI client with PID ${pid}`);
    try {
      await exec('kill', [`-${signal}`, pid]);
      return true;
    } catch (e) {
      if (e.code === 1) {
        return false;
      }
      throw new Error(`Cannot kill the Simulator UI client. Original error: ${e.message}`);
    }
  }

  /**
   * @return {number} The max number of milliseconds to wait until Simulator booting is completed.
   */
  get startupTimeout () {
    return STARTUP_TIMEOUT_MS;
  }

  /**
   * Verify whether the Simulator booting is completed and/or wait for it
   * until the timeout expires.
   *
   * @param {number} startupTimeout - the number of milliseconds to wait until booting is completed.
   * @emits BOOT_COMPLETED_EVENT if the current Simulator is ready to accept simctl commands, like 'install'.
   */
  async waitForBoot (startupTimeout) {
    await this.simctl.startBootMonitor({timeout: startupTimeout});
    this.emit(BOOT_COMPLETED_EVENT);
  }
}

for (const [cmd, fn] of _.toPairs(extensions)) {
  SimulatorXcode8.prototype[cmd] = fn;
}

export default SimulatorXcode8;
