import _ from 'lodash';
import log from './logger';
import { exec } from 'teen_process';
import {
  setLocationWithLyft, setLocationWithIdb, setLocationWithAppleScript
} from './geolocation';
import {
  MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT, launchApp,
  getDeveloperRoot, activateApp
} from './utils';
import path from 'path';
import { getPath as getXcodePath } from 'appium-xcode';
import { fs, tempDir, mkdirp, plist, timing, util } from '@appium/support';
import B from 'bluebird';
import AsyncLock from 'async-lock';
import { retryInterval, waitForCondition } from 'asyncbox';
import { EventEmitter } from 'events';
import Simctl from 'node-simctl';
import { generateDefaultsCommandArgs } from './defaults-utils';

/*
 * This event is emitted as soon as iOS Simulator
 * has finished booting and it is ready to accept xcrun commands.
 * The event handler is called after 'run' method is completed
 * for Xcode 7 and older and is only useful in Xcode 8+,
 * since one can start doing stuff (for example install/uninstall an app) in parallel
 * with Simulator UI startup, which shortens session startup time.
 */
const BOOT_COMPLETED_EVENT = 'bootCompleted';

// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;
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
    this.simulatorApp = 'Simulator.app';
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
      ({stdout} = await exec('pgrep', ['-fn', `${this.simulatorApp}/Contents/MacOS/`]));
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
      let {sdk} = await this.stat();
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
    let home = process.env.HOME;
    return path.resolve(home, 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  /**
   * Install valid .app package on Simulator.
   *
   * @param {string} app - The path to the .app package.
   */
  async installApp (app) {
    return await this.simctl.installApp(app);
  }

  /**
   * Returns user installed bundle ids which has 'bundleName' in their Info.Plist as 'CFBundleName'
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @return {array<string>} - The list of bundle ids which have 'bundleName'
   */
  async getUserInstalledBundleIdsByBundleName (bundleName) {
    const rootUserAppDir = await this.buildBundlePathMap('Bundle');
    const bundleIds = [];
    if (_.isEmpty(rootUserAppDir)) {
      return bundleIds;
    }

    for (const [bundleId, userAppDirPath] of Object.entries(rootUserAppDir)) {
      const appFile = (await fs.readdir(userAppDirPath)).find(
        (file) => path.extname(file).toLowerCase() === '.app');
      const infoPlistPath = path.resolve(userAppDirPath, appFile, 'Info.plist');
      if (!await fs.exists(infoPlistPath)) {
        continue;
      }
      try {
        const infoPlist = await plist.parsePlistFile(infoPlistPath, false);
        if (infoPlist.CFBundleName === bundleName) {
          bundleIds.push(bundleId);
        }
      } catch (err) {
        log.warn(`Failed to read plist ${infoPlistPath}. Original error '${err.message}'`);
        continue;
      }
    }
    log.debug(`The simulator has '${bundleIds.length}' bundles which have '${bundleName}' as their 'CFBundleName':`);
    for (const bundleId of bundleIds) {
      log.debug(`    '${bundleId}'`);
    }
    return bundleIds;
  }

  /**
   * Retrieve the directory for a particular application's data.
   *
   * @param {string} id - Either a bundleId (e.g., com.apple.mobilesafari) or, for iOS 7.1, the app name without `.app` (e.g., MobileSafari)
   * @param {string} subdir - The sub-directory we expect to be within the application directory. Defaults to "Data".
   * @return {string} The root application folder.
   */
  async getAppDir (id, subDir = 'Data') {
    this.appDataBundlePaths[subDir] = this.appDataBundlePaths[subDir] || {};
    if (_.isEmpty(this.appDataBundlePaths[subDir]) && !await this.isFresh()) {
      this.appDataBundlePaths[subDir] = await this.buildBundlePathMap(subDir);
    }
    return this.appDataBundlePaths[subDir][id];
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
   *
   * @return {boolean} True if the current Simulator has never been started before
   */
  async isFresh () {
    const devicePlist = path.resolve(this.getDir(), this.udid, 'device.plist');
    if (await fs.exists(devicePlist)) {
      return false;
    }

    const { lastBootedAt } = await plist.parsePlistFile(devicePlist);
    return !!lastBootedAt;
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

    const simulatorApp = path.resolve(await getXcodePath(), 'Applications', this.simulatorApp);
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
   */
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await this.simctl.eraseDevice(10000);
  }

  /**
   * Scrub (delete the preferences and changed files) the particular application on Simulator.
   *
   * @param {string} appFile - Application name minus ".app".
   * @param {string} appBundleId - Bundle identifier of the application.
   */
  async scrubCustomApp (appFile, appBundleId) {
    return await this.cleanCustomApp(appFile, appBundleId, true);
  }

  /**
   * Retrieve paths to dirs where application data is stored. iOS 8+ stores app data in two places,
   * and iOS 7.1 has only one directory
   *
   * @param {string} appFile - Application name minus ".app".
   * @param {string} appBundleId - Bundle identifier of the application.
   * @param {boolean} scrub - The `Bundle` directory has the actual app in it. If we are just scrubbing,
   *   we want this to stay. If we are cleaning we delete.
   * @return {array<string>} Array of application data paths.
   */
  async getAppDirs (appFile, appBundleId, scrub = false) {
    const data = await this.getAppDir(appBundleId);
    if (!data) {
      return dirs;
    }

    const bundle = !scrub ? await this.getAppDir(appBundleId, 'Bundle') : undefined;
    const dirs = [];
    for (let src of [data, bundle]) {
      if (src) {
        dirs.push(src);
      }
    }
    return dirs;
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
   * Updates variious Safari settings. Simulator must be booted in order to for it
   * to success.
   *
   * @param {object} updates An object containing Safari settings to be updated.
   * The list of available setting names and their values could be retrived by
   * changing the corresponding Safari settings in the UI and then inspecting
   * 'Library/Preferences/com.apple.mobilesafari.plist' file inside of
   * com.apple.mobilesafari app container.
   * The full path to the Mobile Safari's container could be retrieved from
   * `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data`
   * command output.
   * Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command
   * to print the plist content to the Terminal.
   */
  async updateSafariSettings (updates) {
    if (_.isEmpty(updates)) {
      return false;
    }

    const containerRoot = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
    const plistPath = path.join(containerRoot, 'Library', 'Preferences', 'com.apple.mobilesafari.plist');
    return await this.updateSettings(plistPath, updates);
  }

  /**
   * Updates Reduce Motion setting state.
   *
   * @param {boolean} reduceMotion Whether to enable or disable the setting.
   */
  async setReduceMotion (reduceMotion) {
    return await this.updateSettings('com.apple.Accessibility', {
      ReduceMotionEnabled: Number(reduceMotion)
    });
  }

  /**
   * Updates Reduce Transparency setting state.
   *
   * @param {boolean} reduceTransparency Whether to enable or disable the setting.
   */
  async setReduceTransparency (reduceTransparency) {
    return await this.updateSettings('com.apple.Accessibility', {
      EnhancedBackgroundContrastEnabled: Number(reduceTransparency)
    });
  }

  /**
   * Allows to update Simulator preferences in runtime.
   *
   * @param {string} domain The name of preferences domain to be updated,
   * for example, 'com.apple.Preferences' or 'com.apple.Accessibility' or
   * full path to a plist file on the local file system.
   * @param {object} updates Mapping of keys/values to be updated
   * @returns {boolean} True if settings were actually changed
   */
  async updateSettings (domain, updates) {
    if (_.isEmpty(updates)) {
      return false;
    }

    const argChunks = generateDefaultsCommandArgs(updates);
    await B.all(argChunks.map((args) => this.simctl.spawnProcess([
      'defaults', 'write', domain, ...args
    ])));
    return true;
  }

  /**
   * Sets UI appearance style.
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   */
  async setAppearance (/* value */) { // eslint-disable-line require-await
    throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to set UI appearance`);
  }

  /**
   * Gets the current UI appearance style
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   */
  async getAppearance () { // eslint-disable-line require-await
    throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to get UI appearance`);
  }

  // eslint-disable-next-line require-await
  async configureLocalization () {
    throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to configure the Simulator locale`);
  }

  /**
   * Clean up the directories for mobile Safari.
   *
   * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
   */
  async cleanSafari (keepPrefs = true) {
    try {
      if (await this.isRunning()) {
        await this.simctl.terminateApp(MOBILE_SAFARI_BUNDLE_ID);
      }
    } catch (ign) {}

    log.debug('Cleaning mobile safari data files');
    if (await this.isFresh()) {
      log.info(
        'Could not find Safari support directories to clean out old data. ' +
        'Probably there is nothing to clean out'
      );
      return;
    }

    let libraryDir = path.resolve(this.getDir(), 'Library');
    let safariRoot = await this.getAppDir(MOBILE_SAFARI_BUNDLE_ID);
    if (!safariRoot) {
      log.info(
        'Could not find Safari support directories to clean out old ' +
        'data. Probably there is nothing to clean out'
      );
      return;
    }
    let safariLibraryDir = path.resolve(safariRoot, 'Library');
    let filesToDelete = [
      `Caches/Snapshots/${MOBILE_SAFARI_BUNDLE_ID}`,
      `Caches/${MOBILE_SAFARI_BUNDLE_ID}/*`,
      'Caches/com.apple.WebAppCache/*',
      'Caches/com.apple.WebKit.Networking/*',
      'Caches/com.apple.WebKit.WebContent/*',
      'Image Cache/*',
      `WebKit/${MOBILE_SAFARI_BUNDLE_ID}/*`,
      'WebKit/GeolocationSites.plist',
      'WebKit/LocalStorage/*.*',
      'Safari/*',
      'Cookies/*.binarycookies',
      'Caches/com.apple.UIStatusBar/*',
      'Caches/com.apple.keyboards/images/*',
      'Caches/com.apple.Safari.SafeBrowsing/*',
      `../tmp/${MOBILE_SAFARI_BUNDLE_ID}/*`
    ];
    let deletePromises = [];

    for (let file of filesToDelete) {
      deletePromises.push(fs.rimraf(path.resolve(libraryDir, file)));
      deletePromises.push(fs.rimraf(path.resolve(safariLibraryDir, file)));
    }

    if (!keepPrefs) {
      deletePromises.push(fs.rimraf(path.resolve(safariLibraryDir, 'Preferences/*.plist')));
    }

    await B.all(deletePromises);
  }

  /**
   * Uninstall the given application from the current Simulator.
   *
   * @param {string} bundleId - The buindle ID of the application to be removed.
   */
  async removeApp (bundleId) {
    await this.simctl.removeApp(bundleId);
  }

  /**
   * Perform Simulator caches cleanup.
   *
   * @param {...string} folderNames - The names of Caches subfolders to be cleaned.
   *   Non-accessible/non-existing subfolders will be skipped.
   *   All existing subfolders under Caches will be deleted if this parameter is omitted.
   * @returns {number} The count of cleaned cache items.
   *   Zero is returned if no items were matched for cleanup (either not accessible or not directories).
   */
  async clearCaches (...folderNames) {
    const cachesRoot = path.resolve(this.getDir(), 'Library', 'Caches');
    if (!(await fs.hasAccess(cachesRoot))) {
      log.debug(`Caches root at '${cachesRoot}' does not exist or is not accessible. Nothing to do there`);
      return 0;
    }

    let itemsToRemove = folderNames.length ? folderNames : (await fs.readdir(cachesRoot));
    itemsToRemove = itemsToRemove.map((x) => path.resolve(cachesRoot, x));
    if (folderNames.length) {
      itemsToRemove = await B.filter(itemsToRemove, (x) => fs.hasAccess(x));
    }
    itemsToRemove = await B.filter(itemsToRemove, async (x) => (await fs.stat(x)).isDirectory());
    if (!itemsToRemove.length) {
      log.debug(`No Simulator cache items for cleanup were matched in '${cachesRoot}'`);
      return 0;
    }

    log.debug(`Matched ${util.pluralize('simulator cache item', itemsToRemove.length, true)} ` +
      `for cleanup: ${itemsToRemove}`);
    try {
      await B.all(itemsToRemove, (x) => fs.rimraf(x));
    } catch (e) {
      log.warn(`Got an exception while cleaning Simulator caches: ${e.message}`);
    }
    return itemsToRemove.length;
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
    return await UI_CLIENT_ACCESS_GUARD.acquire(this.simulatorApp, async () => {
      try {
        const {stdout} = await exec('osascript', ['-e', resultScript]);
        return stdout;
      } catch (err) {
        log.errorAndThrow(`Could not complete operation. Make sure Simulator UI is running and the parent Appium application (e. g. Appium.app or Terminal.app) ` +
                          `is present in System Preferences > Security & Privacy > Privacy > Accessibility list. If the operation is still unsuccessful then ` +
                          `it is not supported by this Simulator. ` +
                          `Original error: ${err.message}`);
      }
    });
  }

  //region Keychains Interaction
  /**
   * Create the backup of keychains folder.
   * The previously created backup will be automatically
   * deleted if this method was called twice in a row without
   * `restoreKeychains` being invoked.
   *
   * @returns {boolean} True if the backup operation was successfull.
   */
  async backupKeychains () {
    if (!await fs.exists(this.keychainPath)) {
      return false;
    }

    const backupPath = await tempDir.path({
      prefix: `keychains_backup_${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`,
      suffix: '.zip',
    });
    const zipArgs = [
      '-r', backupPath,
      `${this.keychainPath}${path.sep}`
    ];
    log.debug(`Creating keychains backup with 'zip ${zipArgs.join(' ')}' command`);
    await exec('zip', zipArgs);
    if (_.isString(this._keychainsBackupPath) && await fs.exists(this._keychainsBackupPath)) {
      await fs.unlink(this._keychainsBackupPath);
    }
    this._keychainsBackupPath = backupPath;
    return true;
  }

  /**
   * Restore the previsouly created keychains backup.
   *
   * @param {?string|Array<string>} excludePatterns - The list
   * of file name patterns to be excluded from restore. The format
   * of each item should be the same as '-x' option format for
   * 'unzip' utility. This can also be a comma-separated string,
   * which is going be transformed into a list automatically,
   * for example: '*.db*,blabla.sqlite'
   * @returns {boolean} If the restore opration was successful.
   * @throws {Error} If there is no keychains backup available for restore.
   */
  async restoreKeychains (excludePatterns = []) {
    if (!_.isString(this._keychainsBackupPath) || !await fs.exists(this._keychainsBackupPath)) {
      throw new Error(`The keychains backup archive does not exist. ` +
                      `Are you sure it was created before?`);
    }

    if (_.isString(excludePatterns)) {
      excludePatterns = excludePatterns.split(',').map((x) => x.trim());
    }
    const isServerRunning = await this.isRunning();
    let plistPath;
    if (isServerRunning) {
      plistPath = path.resolve(await this.getLaunchDaemonsRoot(), 'com.apple.securityd.plist');
      if (!await fs.exists(plistPath)) {
        throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
      }
      await this.simctl.spawnProcess(['launchctl', 'unload', plistPath]);
    }
    try {
      await fs.rimraf(this.keychainPath);
      await mkdirp(this.keychainPath);
      const unzipArgs = [
        '-o', this._keychainsBackupPath,
        ...(_.flatMap(excludePatterns.map((x) => ['-x', x]))),
        '-d', '/'
      ];
      log.debug(`Restoring keychains with 'unzip ${unzipArgs.join(' ')}' command`);
      await exec('unzip', unzipArgs);
      await fs.unlink(this._keychainsBackupPath);
      this._keychainsBackupPath = null;
    } finally {
      if (isServerRunning && plistPath) {
        await this.simctl.spawnProcess(['launchctl', 'load', plistPath]);
      }
    }
    return true;
  }

  /**
   * Clears Keychains for the particular simulator in runtime (there is no need to stop it).
   *
   * @throws {Error} If keychain cleanup has failed.
   */
  async clearKeychains () {
    const plistPath = path.resolve(await this.getLaunchDaemonsRoot(), 'com.apple.securityd.plist');
    if (!await fs.exists(plistPath)) {
      throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
    }
    await this.simctl.spawnProcess(['launchctl', 'unload', plistPath]);
    try {
      if (await fs.exists(this.keychainPath)) {
        await fs.rimraf(this.keychainPath);
        await mkdirp(this.keychainPath);
      }
    } finally {
      await this.simctl.spawnProcess(['launchctl', 'load', plistPath]);
    }
  }
  //endregion

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
   * Sets the particular permission to the application bundle. See
   * https://github.com/wix/AppleSimulatorUtils for more details on
   * the available service names and statuses.
   *
   * @param {string} bundleId - Application bundle identifier.
   * @param {string} permission - Service name to be set.
   * @param {string} value - The desired status for the service.
   * @throws {Error} If there was an error while changing permission.
   */
  async setPermission (bundleId, permission, value) {
    await this.setPermissions(bundleId, {[permission]: value});
  }

  /**
   * Sets the permissions for the particular application bundle.
   *
   * @param {string} bundleId - Application bundle identifier.
   * @param {Object} permissionsMapping - A mapping where kays
   * are service names and values are their corresponding status values.
   * See https://github.com/wix/AppleSimulatorUtils
   * for more details on available service names and statuses.
   * @throws {Error} If there was an error while changing permissions.
   */
  async setPermissions (bundleId, permissionsMapping) {
    log.debug(`Setting access for '${bundleId}': ${JSON.stringify(permissionsMapping, null, 2)}`);
    await this.permissions.setAccess(bundleId, permissionsMapping);
  }

  /**
   * Retrieves current permission status for the given application bundle.
   *
   * @param {string} bundleId - Application bundle identifier.
   * @param {string} serviceName - One of available service names.
   * @throws {Error} If there was an error while retrieving permissions.
   */
  async getPermission (bundleId, serviceName) {
    const result = await this.permissions.getAccess(bundleId, serviceName);
    log.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);
    return result;
  }

  /**
   * Adds the given certificate into the Trusted Root Store on the simulator.
   * The simulator must be shut down in order for this method to work properly.
   *
   * @param {string} payload the content of the PEM certificate
   * @returns {boolean} `true` if the certificate has been successfully installed
   * or `false` if it has already been there
   */
  // eslint-disable-next-line require-await
  async addCertificate () {
    throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old add certificates`);
  }

  /**
   * Simulates push notification delivery
   *
   * @since Xcode SDK 11.4
   */
  async pushNotification (/* payload */) { // eslint-disable-line require-await
    throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to push notifications`);
  }

  async getLaunchDaemonsRoot () {
    const devRoot = await getDeveloperRoot();
    return path.resolve(devRoot,
      'Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk/System/Library/LaunchDaemons');
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
   * Verify whether the particular application is installed on Simulator.
   * @override
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @return {boolean} True if the given application is installed.
   */
  async isAppInstalled (bundleId) {
    try {
      const appContainer = await this.simctl.getAppContainer(bundleId);
      return appContainer.endsWith('.app');
    } catch (err) {
      // get_app_container subcommand fails for system applications,
      // so we try the hidden appinfo subcommand, which prints correct info for
      // system/hidden apps
      try {
        const info = await this.simctl.appInfo(bundleId);
        return info.includes('ApplicationType');
      } catch (e) {
        return false;
      }
    }
  }

  /**
   * @return {number} The max number of milliseconds to wait until Simulator booting is completed.
   */
  get startupTimeout () {
    return STARTUP_TIMEOUT;
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

  /**
   * Open the given URL in mobile Safari browser.
   * The browser will be started automatically if it is not running.
   *
   * @param {string} url - The URL to be opened.
   */
  async openUrl (url) {
    if (!await this.isRunning()) {
      throw new Error(`Tried to open '${url}', but Simulator is not in Booted state`);
    }
    const timer = new timing.Timer().start();
    try {
      await launchApp(this.simctl, MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT);
      await this.simctl.openUrl(url);
    } catch (err) {
      throw new Error(`Safari could not open '${url}' after ${timer.getDuration().asSeconds.toFixed(3)}s. ` +
        `Original error: ${err.stderr || err.message}`);
    }
    log.debug(`Safari successfully opened '${url}' in ${timer.getDuration().asSeconds.toFixed(3)}s`);
  }

  /**
   * Clean/scrub the particular application on Simulator.
   *
   * @param {string} appFile - Application name minus ".app".
   * @param {string} appBundleId - Bundle identifier of the application.
   * @param {boolean} scrub - If `scrub` is false, we want to clean by deleting the app and all
   *   files associated with it. If `scrub` is true, we just want to delete the preferences and
   *   changed files.
   */
  async cleanCustomApp (appFile, appBundleId, scrub = false) {
    try {
      await this.simctl.terminateApp(appBundleId);
    } catch (ign) {}

    log.debug(`Cleaning app data files for '${appFile}', '${appBundleId}'`);
    if (!scrub) {
      log.debug(`Deleting app altogether`);
    }

    // get the directories to be deleted
    let appDirs = await this.getAppDirs(appFile, appBundleId, scrub);

    if (appDirs.length === 0) {
      log.debug('Could not find app directories to delete. It is probably not installed');
      return;
    }

    const deletePromises = [];
    for (let dir of appDirs) {
      log.debug(`Deleting directory: '${dir}'`);
      deletePromises.push(fs.rimraf(dir));
    }
    if (await this.getPlatformVersion() >= 8) {
      let relRmPath = `Library/Preferences/${appBundleId}.plist`;
      let rmPath = path.resolve(this.getRootDir(), relRmPath);
      log.debug(`Deleting file: '${rmPath}'`);
      deletePromises.push(fs.rimraf(rmPath));
    }
    await B.all(deletePromises);
  }

  /**
   * Perform Shake gesture on Simulator window.
   */
  async shake () {
    log.info(`Performing shake gesture on ${this.udid} Simulator`);
    await this.simctl.spawnProcess([
      'notifyutil',
      '-p', 'com.apple.UIKit.SimulatorShake'
    ]);
  }

  /**
   * Get the current state of Biometric Enrollment feature.
   *
   * @returns {boolean} Either true or false
   * @throws {Error} If Enrollment state cannot be determined
   */
  async isBiometricEnrolled () {
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
        end tell
      end tell
    `);
    log.debug(`Touch ID enrolled state: ${output}`);
    return _.isString(output) && output.trim() === 'true';
  }

  /**
   * Enrolls biometric (TouchId, FaceId) feature testing in Simulator UI client.
   *
   * @param {boolean} isEnabled - Defines whether biometric state is enabled/disabled
   * @throws {Error} If the enrolled state cannot be changed
   */
  async enrollBiometric (isEnabled = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
          if ${isEnabled ? 'not ' : ''}isChecked then
            click dstMenuItem
          end if
        end tell
      end tell
    `);
  }

  /**
   * Sends a notification to match/not match the touch id.
   *
   * @param {?boolean} shouldMatch [true] - Set it to true or false in order to emulate
   * matching/not matching the corresponding biometric
   */
  async sendBiometricMatch (shouldMatch = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "${shouldMatch ? 'Matching Touch' : 'Non-matching Touch'}" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          click dstMenuItem
        end tell
      end tell
    `);
  }

  /**
   * Set custom geolocation parameters for the given Simulator using AppleScript.
   *
   * @param {string|number} latitude - The latitude value, which is going to be entered
   *   into the corresponding edit field, for example '39,0006'.
   * @param {string|number} longitude - The longitude value, which is going to be entered
   *   into the corresponding edit field, for example '19,0068'.
   * @returns {boolean} True if the given parameters have correct format and were successfully accepted.
   * @throws {Error} If there was an error while setting the location
   */
  async setGeolocation (latitude, longitude) {
    const locationSetters = [
      async () => await setLocationWithLyft(this.udid, latitude, longitude),
      async () => await setLocationWithIdb(this.idb, latitude, longitude),
      async () => await setLocationWithAppleScript(this, latitude, longitude, this._locationMenu),
    ];

    let lastError;
    for (const setter of locationSetters) {
      try {
        await setter();
        return true;
      } catch (e) {
        log.info(e.message);
        lastError = e;
      }
    }
    throw lastError;
  }

}

export default SimulatorXcode8;
