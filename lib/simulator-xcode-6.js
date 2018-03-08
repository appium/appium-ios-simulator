import path from 'path';
import * as simctl from 'node-simctl';
import { default as xcode, getPath as getXcodePath } from 'appium-xcode';
import log from './logger';
import { fs, tempDir, mkdirp } from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';
import AsyncLock from 'async-lock';
import { killAllSimulators, safeRimRaf } from './utils.js';
import { asyncmap, retryInterval, waitForCondition, retry } from 'asyncbox';
import * as settings from './settings';
import { exec } from 'teen_process';
import { tailUntil } from './tail-until.js';
import extensions from './extensions/index';
import events from 'events';
import Calendar from './calendar';
const { EventEmitter } = events;


const STARTUP_TIMEOUT = 60 * 1000;
const EXTRA_STARTUP_TIME = 2000;
const UI_CLIENT_ACCESS_GUARD = new AsyncLock();

/*
 * This event is emitted as soon as iOS Simulator
 * has finished booting and it is ready to accept xcrun commands.
 * The event handler is called after 'run' method is completed
 * for Xcode 7 and older and is only useful in Xcode 8+,
 * since one can start doing stuff (for example install/uninstall an app) in parallel
 * with Simulator UI startup, which shortens session startup time.
 */
const BOOT_COMPLETED_EVENT = 'bootCompleted';


class SimulatorXcode6 extends EventEmitter {

  /**
   * Constructs the object with the `udid` and version of Xcode. Use the exported `getSimulator(udid)` method instead.
   *
   * @param {string} udid - The Simulator ID.
   * @param {object} xcodeVersion - The target Xcode version in format {major, minor, build}.
   */
  constructor (udid, xcodeVersion) {
    super();
    this.udid = String(udid);
    this.xcodeVersion = xcodeVersion;

    // platformVersion cannot be found initially, since getting it has side effects for
    // our logic for figuring out if a sim has been run
    // it will be set when it is needed
    this._platformVersion = null;

    this.keychainPath = path.resolve(this.getDir(), 'Library', 'Keychains');
    this.simulatorApp = 'iOS Simulator.app';

    this.appDataBundlePaths = {};

    // list of files to check for when seeing if a simulator is "fresh"
    // (meaning it has never been booted).
    // If these files are present, we assume it's been successfully booted
    this.isFreshFiles = [
      'Library/ConfigurationProfiles',
      'Library/Cookies',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];

    // extra time to wait for simulator to be deemed booted
    this.extraStartupTime = EXTRA_STARTUP_TIME;

    this.calendar = new Calendar(this.getDir());
  }

  /**
   * Check the state of Simulator UI client.
   *
   * @return {boolean} True of if UI client is running or false otherwise.
   */
  async isUIClientRunning () {
    try {
      await exec('pgrep', ['-x', this.simulatorApp.split('.')[0]]);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * How long to wait before throwing an error about Simulator startup timeout happened.
   *
   * @return {number} The number of milliseconds.
   */
  get startupTimeout () {
    return STARTUP_TIMEOUT;
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
    let home = process.env.HOME;
    return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
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
    return await simctl.installApp(this.udid, app);
  }

  /**
   * Verify whether the particular application is installed on Simulator.
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @param {string} appFule - Application name minus ".app" (for iOS 7.1)
   * @return {boolean} True if the given application is installed
   */
  async isAppInstalled (bundleId, appFile = null) {
    // `appFile` argument only necessary for iOS below version 8
    let appDirs = await this.getAppDirs(appFile, bundleId);
    return appDirs.length !== 0;
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
   * The xcode 6 simulators are really annoying, and bury the main app
   * directories inside directories just named with Hashes.
   * This function finds the proper directory by traversing all of them
   * and reading a metadata plist (Mobile Container Manager) to get the
   * bundle id.
   *
   * @param {string} subdir - The sub-directory we expect to be within the application directory. Defaults to "Data".
   * @return {object} The list of path-bundle pairs to an object where bundleIds are mapped to paths.
   */
  async buildBundlePathMap (subDir = 'Data') {
    log.debug('Building bundle path map');
    let applicationList;
    let pathBundlePair;
    if (await this.getPlatformVersion() === '7.1') {
      // apps available
      //   Web.app,
      //   WebViewService.app,
      //   MobileSafari.app,
      //   WebContentAnalysisUI.app,
      //   DDActionsService.app,
      //   StoreKitUIService.app
      applicationList = path.resolve(this.getDir(), 'Applications');
      pathBundlePair = async (dir) => {
        dir = path.resolve(applicationList, dir);
        let appFiles = await fs.glob(`${dir}/*.app`);
        let bundleId = appFiles[0].match(/.*\/(.*)\.app/)[1];
        return {path: dir, bundleId};
      };
    } else {
      applicationList = path.resolve(this.getDir(), 'Containers', subDir, 'Application');
      // given a directory, find the plist file and pull the bundle id from it
      let readBundleId = async (dir) => {
        let plist = path.resolve(dir, '.com.apple.mobile_container_manager.metadata.plist');
        let metadata = await settings.read(plist);
        return metadata.MCMMetadataIdentifier;
      };
      // given a directory, return the path and bundle id associated with it
      pathBundlePair = async (dir) => {
        dir = path.resolve(applicationList, dir);
        let bundleId = await readBundleId(dir);
        return {path: dir, bundleId};
      };
    }

    let bundlePathDirs = await fs.readdir(applicationList);
    let bundlePathPairs = await asyncmap(bundlePathDirs, async (dir) => {
      return await pathBundlePair(dir);
    }, false);

    // reduce the list of path-bundle pairs to an object where bundleIds are mapped to paths
    return bundlePathPairs.reduce((bundleMap, bundlePath) => {
      bundleMap[bundlePath.bundleId] = bundlePath.path;
      return bundleMap;
    }, {});
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
    for (let [sdk, deviceArr] of _.toPairs(await simctl.getDevices())) {
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
   * This is a best-bet heuristic for whether or not a sim has been booted
   * before. We usually want to start a simulator to "warm" it up, have
   * Xcode populate it with plists for us to manipulate before a real
   * test run.
   *
   * @return {boolean} True if the current Simulator has never been started before
   */
  async isFresh () {
    // if the following files don't exist, it hasn't been booted.
    // THIS IS NOT AN EXHAUSTIVE LIST
    log.debug('Checking whether simulator has been run before');
    let files = this.isFreshFiles;

    let pv = await this.getPlatformVersion();
    if (pv !== '7.1') {
      files.push('Library/Preferences/com.apple.Preferences.plist');
    } else {
      files.push('Applications');
    }

    files = files.map((s) => {
      return path.resolve(this.getDir(), s);
    });

    let existences = await asyncmap(files, async (f) => { return await fs.hasAccess(f); });
    let fresh = _.compact(existences).length !== files.length;
    log.debug(`Simulator ${fresh ? 'has not' : 'has'} been run before`);
    return fresh;
  }

  /**
   * Retrieves the state of the current Simulator. One should distinguish the
   * states of Simulator UI and the Simulator itself.
   *
   * @return {boolean} True if the current Simulator is running.
   */
  async isRunning () {
    let stat = await this.stat();
    return stat.state === 'Booted';
  }

  /**
   * Verify whether the Simulator booting is completed and/or wait for it
   * until the timeout expires.
   *
   * @param {number} startupTimeout - the number of milliseconds to wait until booting is completed.
   * @emits BOOT_COMPLETED_EVENT if the current Simulator is ready to accept simctl commands, like 'install'.
   */
  async waitForBoot (startupTimeout) {
    // wait for the simulator to boot
    // waiting for the simulator status to be 'booted' isn't good enough
    // it claims to be booted way before finishing loading
    // let's tail the simulator system log until we see a magic line (this.bootedIndicator)
    let bootedIndicator = await this.getBootedIndicatorString();
    await this.tailLogsUntil(bootedIndicator, startupTimeout);

    // so sorry, but we should wait another two seconds, just to make sure we've really started
    // we can't look for another magic log line, because they seem to be app-dependent (not system dependent)
    log.debug(`Waiting an extra ${this.extraStartupTime}ms for the simulator to really finish booting`);
    await B.delay(this.extraStartupTime);
    log.debug('Done waiting extra time for simulator');

    this.emit(BOOT_COMPLETED_EVENT);
  }

  /**
   * Returns a magic string, which, if present in logs, reflects the fact that simulator booting has been completed.
   *
   * @return {string} The magic log string.
   */
  async getBootedIndicatorString () {
    let indicator;
    let platformVersion = await this.getPlatformVersion();
    switch (platformVersion) {
      case '7.1':
      case '8.1':
      case '8.2':
      case '8.3':
      case '8.4':
        indicator = 'profiled: Service starting...';
        break;
      case '9.0':
      case '9.1':
      case '9.2':
      case '9.3':
        indicator = 'System app "com.apple.springboard" finished startup';
        break;
      case '10.0':
        indicator = 'Switching to keyboard';
        break;
      default:
        log.warn(`No boot indicator case for platform version '${platformVersion}'`);
        indicator = 'no boot indicator string available';
    }
    return indicator;
  }

  /**
   * Start the Simulator UI client with the given arguments
   *
   * @param {object} opts - One or more of available Simulator UI client options:
   *   - {string} scaleFactor: can be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   *   Defines the window scale value for the UI client window for the current Simulator.
   *   Equals to null by default, which keeps the current scale unchanged.
   *   - {boolean} connectHardwareKeyboard: whether to connect the hardware keyboard to the
   *   Simulator UI client. Equals to false by default.
   *   - {number} startupTimeout: number of milliseconds to wait until Simulator booting
   *   process is completed. The default timeout will be used if not set explicitly.
   */
  async startUIClient (opts = {}) {
    opts = Object.assign({
      scaleFactor: null,
      connectHardwareKeyboard: false,
      startupTimeout: this.startupTimeout,
    }, opts);

    const simulatorApp = path.resolve(await getXcodePath(), 'Applications', this.simulatorApp);
    const args = ['-Fn', simulatorApp, '--args', '-CurrentDeviceUDID', this.udid];

    if (opts.scaleFactor) {
      const stat = await this.stat();
      const formattedDeviceName = stat.name.replace(/\s+/g, '-');
      const argumentName = `-SimulatorWindowLastScale-com.apple.CoreSimulator.SimDeviceType.${formattedDeviceName}`;
      args.push(argumentName, opts.scaleFactor);
    }

    if (_.isBoolean(opts.connectHardwareKeyboard)) {
      args.push('-ConnectHardwareKeyboard', opts.connectHardwareKeyboard ? '1' : '0');
    }

    log.info(`Starting Simulator UI with command: open ${args.join(' ')}`);
    await exec('open', args, {timeout: opts.startupTimeout});
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
    const {state} = await this.stat();
    const isServerRunning = state === 'Booted';
    const isUIClientRunning = await this.isUIClientRunning();
    if (isServerRunning && isUIClientRunning) {
      log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
      return;
    }
    const startTime = process.hrtime();
    try {
      await this.shutdown();
    } catch (err) {
      log.warn(`Error on Simulator shutdown: ${err.message}`);
    }
    await this.startUIClient(opts);

    await this.waitForBoot(opts.startupTimeout);
    log.info(`Simulator with UDID ${this.udid} booted in ${process.hrtime(startTime)[0]} seconds`);
  }

  // TODO keep keychains
  /**
   * Reset the current Simulator to the clean state.
   */
  async clean () {
    await this.endSimulatorDaemon();
    log.info(`Cleaning simulator ${this.udid}`);
    await simctl.eraseDevice(this.udid, 10000);
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
   * Clean/scrub the particular application on Simulator.
   *
   * @param {string} appFile - Application name minus ".app".
   * @param {string} appBundleId - Bundle identifier of the application.
   * @param {boolean} scrub - If `scrub` is false, we want to clean by deleting the app and all
   *   files associated with it. If `scrub` is true, we just want to delete the preferences and
   *   changed files.
   */
  async cleanCustomApp (appFile, appBundleId, scrub = false) {
    log.debug(`Cleaning app data files for '${appFile}', '${appBundleId}'`);
    if (!scrub) {
      log.debug(`Deleting app altogether`);
    }

    // get the directories to be deleted
    let appDirs = await this.getAppDirs(appFile, appBundleId, scrub);

    if (appDirs.length === 0) {
      log.debug("Could not find app directories to delete. It is probably not installed");
      return;
    }

    let deletePromises = [];

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
    let dirs = [];
    if (await this.getPlatformVersion() >= 8) {
      let data = await this.getAppDir(appBundleId);
      if (!data) return dirs; // eslint-disable-line curly

      let bundle = !scrub ? await this.getAppDir(appBundleId, 'Bundle') : undefined;

      for (let src of [data, bundle]) {
        if (src) {
          dirs.push(src);
        }
      }
    } else {
      let data = await this.getAppDir(appFile);
      if (data) {
        dirs.push(data);
      }
    }
    return dirs;
  }

  /**
   * Execute the Simulator in order to have the initial file structure created and shutdown it afterwards.
   *
   * @param {boolean} safari - Whether to execute mobile Safari after startup.
   * @param {number} startupTimeout - How long to wait until Simulator booting is completed (in milliseconds).
   */
  async launchAndQuit (safari = false, startupTimeout = this.startupTimeout) {
    log.debug('Attempting to launch and quit the simulator, to create directory structure');
    log.debug(`Will launch with Safari? ${safari}`);

    await this.run(startupTimeout);

    if (safari) {
      await this.openUrl('http://www.appium.io');
    }

    // wait for the system to create the files we will manipulate
    // need quite a high retry number, in order to accommodate iOS 7.1
    // locally, 7.1 averages 8.5 retries (from 6 - 12)
    //          8 averages 0.6 retries (from 0 - 2)
    //          9 averages 14 retries
    await retryInterval(20, 250, async () => {
      if (await this.isFresh()) {
        let msg = 'Simulator files not fully created. Waiting a bit';
        log.debug(msg);
        throw new Error(msg);
      }
    });

    // and quit
    await this.shutdown();
  }

  /**
   * Looks for launchd daemons corresponding to the sim udid and tries to stop them cleanly
   * This prevents xcrun simctl erase from hanging.
   */
  async endSimulatorDaemon () {
    log.debug(`Killing any simulator daemons for ${this.udid}`);

    let launchctlCmd = `launchctl list | grep ${this.udid} | cut -f 3 | xargs -n 1 launchctl`;
    try {
      let stopCmd = `${launchctlCmd} stop`;
      await exec('bash', ['-c', stopCmd]);
    } catch (err) {
      log.warn(`Could not stop simulator daemons: ${err.message}`);
      log.debug('Carrying on anyway!');
    }
    try {
      let removeCmd = `${launchctlCmd} remove`;
      await exec('bash', ['-c', removeCmd]);
    } catch (err) {
      log.warn(`Could not remove simulator daemons: ${err.message}`);
      log.debug('Carrying on anyway!');
    }
    try {
      // Waits 10 sec for the simulator launchd services to stop.
      await waitForCondition(async () => {
        let {stdout} = await exec('bash', ['-c',
          `ps -e  | grep ${this.udid} | grep launchd_sim | grep -v bash | grep -v grep | awk {'print$1'}`]);
        return stdout.trim().length === 0;
      }, {waitMs: 10000, intervalMs: 500});
    } catch (err) {
      log.warn(`Could not end simulator daemon for ${this.udid}: ${err.message}`);
      log.debug('Carrying on anyway!');
    }
  }

  /**
   * Shutdown all the running Simulators and the UI client.
   */
  async shutdown () {
    await killAllSimulators();
  }

  /**
   * Delete the particular Simulator from devices list
   */
  async delete () {
    await simctl.deleteDevice(this.udid);
  }

  /**
   * Update the particular preference file with the given key/value pairs.
   *
   * @param {string} plist - The preferences file to update.
   * @param {object} updates - The key/value pairs to update.
   */
  async updateSettings (plist, updates) {
    return await settings.updateSettings(this, plist, updates);
  }

  /**
   * Authorize/de-authorize location settings for a particular application.
   *
   * @param {string} bundleId - The application ID to update.
   * @param {boolean} authorized - Whether or not to authorize.
   */
  async updateLocationSettings (bundleId, authorized) {
    return await settings.updateLocationSettings(this, bundleId, authorized);
  }

  /**
   * Update settings for Safari.
   *
   * @param {object} updates - The hash of key/value pairs to update for Safari.
   */
  async updateSafariSettings (updates) {
    await settings.updateSafariUserSettings(this, updates);
    await settings.updateSettings(this, 'mobileSafari', updates);
  }

  /**
   * Update the locale for the Simulator.
   *
   * @param {string} language - The language for the simulator. E.g., `"fr_US"`.
   * @param {string} locale - The locale to set for the simulator. E.g., `"en"`.
   * @param {string} calendarFormat - The format of the calendar.
   */
  async updateLocale (language, locale, calendarFormat) {
    return await settings.updateLocale(this, language, locale, calendarFormat);
  }

  /**
   * Completely delete mobile Safari application from the current Simulator.
   */
  async deleteSafari () {
    log.debug('Deleting Safari apps from simulator');

    let dirs = [];

    // get the data directory
    dirs.push(await this.getAppDir('com.apple.mobilesafari'));

    let pv = await this.getPlatformVersion();
    if (pv >= 8) {
      // get the bundle directory
      dirs.push(await this.getAppDir('com.apple.mobilesafari', 'Bundle'));
    }

    let deletePromises = [];
    for (let dir of _.compact(dirs)) {
      log.debug(`Deleting directory: '${dir}'`);
      deletePromises.push(fs.rimraf(dir));
    }
    await B.all(deletePromises);
  }

  /**
   * Clean up the directories for mobile Safari.
   *
   * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
   */
  async cleanSafari (keepPrefs = true) {
    log.debug('Cleaning mobile safari data files');
    if (await this.isFresh()) {
      log.info('Could not find Safari support directories to clean out old ' +
               'data. Probably there is nothing to clean out');
      return;
    }

    let libraryDir = path.resolve(this.getDir(), 'Library');
    let safariRoot = await this.getAppDir('com.apple.mobilesafari');
    if (!safariRoot) {
      log.info('Could not find Safari support directories to clean out old ' +
               'data. Probably there is nothing to clean out');
      return;
    }
    let safariLibraryDir = path.resolve(safariRoot, 'Library');
    let filesToDelete = [
      'Caches/Snapshots/com.apple.mobilesafari',
      'Caches/com.apple.mobilesafari/*',
      'Caches/com.apple.WebAppCache/*',
      'Caches/com.apple.WebKit.Networking/*',
      'Caches/com.apple.WebKit.WebContent/*',
      'Image Cache/*',
      'WebKit/com.apple.mobilesafari/*',
      'WebKit/GeolocationSites.plist',
      'WebKit/LocalStorage/*.*',
      'Safari/*',
      'Cookies/*.binarycookies',
      'Caches/com.apple.UIStatusBar/*',
      'Caches/com.apple.keyboards/images/*',
      'Caches/com.apple.Safari.SafeBrowsing/*',
      '../tmp/com.apple.mobilesafari/*'
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
    await simctl.removeApp(this.udid, bundleId);
  }

  /**
   * Move a built-in application to a new place (actually, rename it).
   *
   * @param {string} appName - The name of the app to be moved.
   * @param {string} appPath - The current path to the application.
   * @param {string} newAppPath - The new path to the application.
   *   If some application already exists by this path then it's going to be removed.
   */
  async moveBuiltInApp (appName, appPath, newAppPath) {
    await safeRimRaf(newAppPath);
    await fs.copyFile(appPath, newAppPath);
    log.debug(`Copied '${appName}' to '${newAppPath}'`);

    await fs.rimraf(appPath);
    log.debug(`Temporarily deleted original app at '${appPath}'`);

    return [newAppPath, appPath];
  }

  /**
   * Open the given URL in mobile Safari browser.
   * The browser will be started automatically if it is not running.
   *
   * @param {string} url - The URL to be opened.
   */
  async openUrl (url) {
    const SAFARI_BOOTED_INDICATOR = 'MobileSafari[';
    const SAFARI_STARTUP_TIMEOUT = 15 * 1000;
    const EXTRA_STARTUP_TIME = 3 * 1000;

    if (await this.isRunning()) {
      await retry(5000, simctl.openUrl, this.udid, url);
      await this.tailLogsUntil(SAFARI_BOOTED_INDICATOR, SAFARI_STARTUP_TIMEOUT);
      // So sorry, but the logs have nothing else for Safari starting.. just delay a little bit
      log.debug(`Safari started, waiting ${EXTRA_STARTUP_TIME}ms for it to fully start`);
      await B.delay(EXTRA_STARTUP_TIME);
      log.debug('Done waiting for Safari');
      return;
    } else {
      throw new Error('Tried to open a url, but the Simulator is not Booted');
    }
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

    log.debug(`Matched ${itemsToRemove.length} Simulator cache ` +
      `item${itemsToRemove.length === 1 ? '' : 's'} for cleanup: ${itemsToRemove}`);
    try {
      await B.all(itemsToRemove, (x) => fs.rimraf(x));
    } catch (e) {
      log.warn(`Got an exception while cleaning Simulator caches: ${e.message}`);
    }
    return itemsToRemove.length;
  }

  /**
   * Blocks until the given indicater string appears in Simulator logs.
   *
   * @param {string} bootedIndicator - The magic string, which appears in logs after Simulator booting is completed.
   * @param {number} timeoutMs - The maximumm number of milliseconds to wait for the string indicator presence.
   * @returns {Promise} A promise that resolves when the ios simulator logs output a line matching `bootedIndicator`
   * times out after timeoutMs
   */
  async tailLogsUntil (bootedIndicator, timeoutMs) {
    let simLog = path.resolve(this.getLogDir(), 'system.log');

    // we need to make sure log file exists before we can tail it
    await retryInterval(200, 200, async () => {
      let exists = await fs.exists(simLog);
      if (!exists) {
        throw new Error(`Could not find Simulator log: '${simLog}'`);
      }
    });

    log.info(`Simulator log at '${simLog}'`);
    log.info(`Tailing simulator logs until we encounter the string "${bootedIndicator}"`);
    log.info(`We will time out after ${timeoutMs}ms`);
    try {
      await tailUntil(simLog, bootedIndicator, timeoutMs);
    } catch (err) {
      log.debug('Simulator startup timed out. Continuing anyway.');
    }
  }

  /**
   * Enable Calendar access for the given application.
   *
   * @param {string} bundleID - Bundle ID of the application, for which the access should be granted.
   */
  async enableCalendarAccess (bundleID) {
    await this.calendar.enableCalendarAccess(bundleID);
  }

  /**
   * Disable Calendar access for the given application.
   *
   * @param {string} bundleID - Bundle ID of the application, for which the access should be denied.
   */
  async disableCalendarAccess (bundleID) {
    await this.calendar.disableCalendarAccess(bundleID);
  }

  /**
   * Check whether the given application has access to Calendar.
   *
   * @return {boolean} True if the given application has the access.
   */
  async hasCalendarAccess (bundleID) {
    return await this.calendar.hasCalendarAccess(bundleID);
  }

  /**
   * Generate Apple script, which activates Simulator.
   *
   * @returns {string} the generated Apple Script snippet.
   */
  async generateWindowActivationScript () {
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
    const windowActivationScript = await this.generateWindowActivationScript();
    const resultScript = `${windowActivationScript}\n${appleScript}`;
    log.debug(`Executing UI Apple Script on Simulator with UDID ${this.udid}: ${resultScript}`);
    return await UI_CLIENT_ACCESS_GUARD.acquire(this.simulatorApp, async () => {
      try {
        const {stdout} = await exec('osascript', ['-e', resultScript]);
        return stdout;
      } catch (err) {
        log.errorAndThrow(`Make sure Simulator UI is running and the parent Appium application (e. g. Appium.app or Terminal.app) ` +
                          `is present in System Preferences > Security & Privacy > Privacy > Accessibility list. ` +
                          `Original error: ${err.message}`);
      }
    });
  }

  /**
   * Get the current state of Touch ID Enrollment feature.
   *
   * @return {boolean} True if Touch ID Enrollment menu item is checked in Simulator menu
   */
  async isTouchIDEnrolled () {
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
   * Execute a special Apple script, which changes Touch ID feature testing in Simulator UI client.
   *
   * @param {boolean} isEnabled - Set it to false in order to uncheck 'Toggle Enrolled State' flag
   */
  async enrollTouchID (isEnabled = true) {
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
   * Execute a special Apple script, which clicks the particular button on Database alert.
   *
   * @param {boolean} increase - Click the button with 'Increase' title on the alert if this
   *   parameter is true. The 'Cancel' button will be clicked otherwise.
   */
  async dismissDatabaseAlert (increase = true) {
    let button = increase ? 'Increase' : 'Cancel';
    log.debug(`Attempting to dismiss database alert with '${button}' button`);
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          click button "${button}" of window 1
        end tell
      end tell
    `);
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
    return true;
  }
  //endregion

  static async _getDeviceStringPlatformVersion (platformVersion) {
    let reqVersion = platformVersion;
    if (!reqVersion) {
      reqVersion = await xcode.getMaxIOSSDK();
      log.warn(`No platform version set. Using max SDK version: ${reqVersion}`);
      // this will be a number, and possibly an integer (e.g., if max iOS SDK is 9)
      // so turn it into a string and add a .0 if necessary
      if (!_.isString(reqVersion)) {
        reqVersion = (reqVersion % 1) ? String(reqVersion) : `${reqVersion}.0`;
      }
    }
    return reqVersion;
  }

  // change the format in subclasses, as necessary
  static async _getDeviceStringVersionString (platformVersion) {
    let reqVersion = await this._getDeviceStringPlatformVersion(platformVersion);

    return `(${reqVersion} Simulator)`;
  }

  // change the format in subclasses, as necessary
  static _getDeviceStringConfigFix () {
    // some devices need to be updated
    return {
      'iPad Simulator (7.1 Simulator)': 'iPad 2 (7.1 Simulator)',
      'iPad Simulator (8.0 Simulator)': 'iPad 2 (8.0 Simulator)',
      'iPad Simulator (8.1 Simulator)': 'iPad 2 (8.1 Simulator)',
      'iPad Simulator (8.2 Simulator)': 'iPad 2 (8.2 Simulator)',
      'iPad Simulator (8.3 Simulator)': 'iPad 2 (8.3 Simulator)',
      'iPad Simulator (8.4 Simulator)': 'iPad 2 (8.4 Simulator)',
      'iPhone Simulator (7.1 Simulator)': 'iPhone 5s (7.1 Simulator)',
      'iPhone Simulator (8.4 Simulator)': 'iPhone 6 (8.4 Simulator)',
      'iPhone Simulator (8.3 Simulator)': 'iPhone 6 (8.3 Simulator)',
      'iPhone Simulator (8.2 Simulator)': 'iPhone 6 (8.2 Simulator)',
      'iPhone Simulator (8.1 Simulator)': 'iPhone 6 (8.1 Simulator)',
      'iPhone Simulator (8.0 Simulator)': 'iPhone 6 (8.0 Simulator)'
    };
  }

  /**
   * Takes a set of options and finds the correct device string in order for Instruments to
   * identify the correct simulator.
   *
   * @param {object} opts - The options available are:
   *   - `deviceName` - a name for the device. If the given device name starts with `=`, the name, less the equals sign, is returned.
   *   - `platformVersion` - the version of iOS to use. Defaults to the current Xcode's maximum SDK version.
   *   - `forceIphone` - force the configuration of the device string to iPhone. Defaults to `false`.
   *   - `forceIpad` - force the configuration of the device string to iPad. Defaults to `false`.
   *   If both `forceIphone` and `forceIpad` are true, the device will be forced to iPhone.
   *
   * @return {string} The found device string.
   */
  static async getDeviceString (opts) {
    opts = Object.assign({}, {
      deviceName: null,
      platformVersion: null,
      forceIphone: false,
      forceIpad: false
    }, opts);
    let logOpts = {
      deviceName: opts.deviceName,
      platformVersion: opts.platformVersion,
      forceIphone: opts.forceIphone,
      forceIpad: opts.forceIpad
    };
    log.debug(`Getting device string from options: ${JSON.stringify(logOpts)}`);

    // short circuit if we already have a device name
    if ((opts.deviceName || '')[0] === '=') {
      return opts.deviceName.substring(1);
    }

    let isiPhone = !!opts.forceIphone || !opts.forceIpad;

    if (opts.deviceName) {
      let device = opts.deviceName.toLowerCase();
      if (device.indexOf('iphone') !== -1) {
        isiPhone = true;
      } else if (device.indexOf('ipad') !== -1) {
        isiPhone = false;
      }
    }

    let iosDeviceString = opts.deviceName || (isiPhone ? 'iPhone Simulator' : 'iPad Simulator');

    // if someone passes in just "iPhone", make that "iPhone Simulator" to
    // conform to all the logic below
    if (/^(iPhone|iPad)$/.test(iosDeviceString)) {
      iosDeviceString += " Simulator";
    }

    // we support deviceName: "iPhone Simulator", and also want to support
    // "iPhone XYZ Simulator", but these strings aren't in the device list.
    // So, if someone sent in "iPhone XYZ Simulator", strip off " Simulator"
    // in order to allow the default "iPhone XYZ" match
    if (/[^(iPhone|iPad)] Simulator/.test(iosDeviceString)) {
      iosDeviceString = iosDeviceString.replace(" Simulator", "");
    }
    iosDeviceString += ` ${await this._getDeviceStringVersionString(opts.platformVersion)}`;

    let CONFIG_FIX = this._getDeviceStringConfigFix();

    let configFix = CONFIG_FIX;
    if (configFix[iosDeviceString]) {
      iosDeviceString = configFix[iosDeviceString];
      log.debug(`Fixing device. Changed from '${opts.deviceName}' `+
                   `to '${iosDeviceString}'`);
    }

    log.debug(`Final device string is '${iosDeviceString}'`);
    return iosDeviceString;
  }

  /*
   * @return {?string} The full path to the simulator's WebInspector Unix Domain Socket
   *   or `null` if there is no socket.
   */
  async getWebInspectorSocket () {
    // there is no WebInspector socket for this version of Xcode
    return null;
  }
}

for (let [cmd, fn] of _.toPairs(extensions)) {
  SimulatorXcode6.prototype[cmd] = fn;
}

export default SimulatorXcode6;
export { SimulatorXcode6, BOOT_COMPLETED_EVENT };
