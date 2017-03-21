import path from 'path';
import * as simctl from 'node-simctl';
import { default as xcode, getPath as getXcodePath } from 'appium-xcode';
import log from './logger';
import { fs } from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';
import { killAllSimulators, safeRimRaf } from './utils.js';
import { setTouchEnrollKey } from './touch-enroll.js';
import { asyncmap, waitForCondition, retryInterval, retry } from 'asyncbox';
import * as settings from './settings';
import { exec } from 'teen_process';
import { tailUntil } from './tail-until.js';
import extensions from './extensions/index';
import events from 'events';
import Calendar from './calendar';
const { EventEmitter } = events;

const OPEN_TIMEOUT = 3000;
const STARTUP_TIMEOUT = 60 * 1000;
const EXTRA_STARTUP_TIME = 2000;
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

    this.scaleFactor = null;
    this.connectHardwareKeyboard = null;

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

  get startupTimeout () {
    return STARTUP_TIMEOUT;
  }

  setScaleFactor (newScaleFactor) {
    let supportedScales = ['1.0', '0.75', '0.5', '0.33', '0.25'];
    if (supportedScales.indexOf(newScaleFactor) < 0) {
      let msg = `Only "${supportedScales}" values are supported as scale factors. "${newScaleFactor}" is passed instead.`;
      log.errorAndThrow(msg);
    }
    this.scaleFactor = newScaleFactor;
  }

  setConnectHardwareKeyboard (newValue) {
    this.connectHardwareKeyboard = newValue;
  }

  async getPlatformVersion () {
    if (!this._platformVersion) {
      let {sdk} = await this.stat();
      this._platformVersion = sdk;
    }
    return this._platformVersion;
  }

  getRootDir () {
    let home = process.env.HOME;
    return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
  }

  getDir () {
    return path.resolve(this.getRootDir(), this.udid, 'data');
  }

  getLogDir () {
    let home = process.env.HOME;
    return path.resolve(home, 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  async installApp (app) {
    return await simctl.installApp(this.udid, app);
  }

  async isAppInstalled (bundleId, appFile = null) {
    // `appFile` argument only necessary for iOS below version 8
    let appDirs = await this.getAppDirs(appFile, bundleId);
    return appDirs.length !== 0;
  }

  /*
   * takes an `id`, which is either a bundleId (e.g., com.apple.mobilesafari)
   * or, for iOS 7.1, the app name without `.app` (e.g., MobileSafari)
   */
  async getAppDir (id, subDir = 'Data') {
    this.appDataBundlePaths[subDir] = this.appDataBundlePaths[subDir] || {};
    if (_.isEmpty(this.appDataBundlePaths[subDir]) && !await this.isFresh()) {
      this.appDataBundlePaths[subDir] = await this.buildBundlePathMap(subDir);
    }
    return this.appDataBundlePaths[subDir][id];
  }

  /*
   * the xcode 6 simulators are really annoying, and bury the main app
   * directories inside directories just named with Hashes.
   * This function finds the proper directory by traversing all of them
   * and reading a metadata plist (Mobile Container Manager) to get the
   * bundle id.
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

  // returns state and specifics of this sim.
  // { name: 'iPhone 4s',
  //   udid: 'C09B34E5-7DCB-442E-B79C-AB6BC0357417',
  //   state: 'Shutdown',
  //   sdk: '8.3'
  // }
  async stat () {
    let devices = await simctl.getDevices();
    let normalizedDevices = [];

    // add sdk attribute to all entries, add to normalizedDevices
    for (let [sdk, deviceArr] of _.toPairs(devices)) {
      deviceArr = deviceArr.map((device) => {
        device.sdk = sdk;
        return device;
      });
      normalizedDevices = normalizedDevices.concat(deviceArr);
    }

    return _.find(normalizedDevices, {udid: this.udid});
  }

  async isFresh () {
    // this is a best-bet heuristic for whether or not a sim has been booted
    // before. We usually want to start a simulator to "warm" it up, have
    // Xcode populate it with plists for us to manipulate before a real
    // test run.

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

  async isRunning () {
    let stat = await this.stat();
    return stat.state === 'Booted';
  }

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

  async run (startupTimeout = this.startupTimeout, allowTouchEnroll = false) {
    let simulatorApp = path.resolve(await getXcodePath(), 'Applications', this.simulatorApp);
    let args = ['-Fn', simulatorApp, '--args', '-CurrentDeviceUDID', this.udid];
    if (this.scaleFactor) {
      let stat = await this.stat();
      let formattedDeviceName = stat.name.replace(/\s+/g, '-');
      let argumentName = `-SimulatorWindowLastScale-com.apple.CoreSimulator.SimDeviceType.${formattedDeviceName}`;
      args.push(argumentName, this.scaleFactor);
    }
    if (!this.connectHardwareKeyboard) {
      args.push('-ConnectHardwareKeyboard', '0');
    }

    // Set the 'Touch ID Enroll' key bindings before the Simulator starts
    if (allowTouchEnroll) {
      await setTouchEnrollKey();
    }

    log.info(`Starting simulator with command: open ${args.join(' ')}`);
    let startTime = Date.now();
    await exec('open', args, {timeout: OPEN_TIMEOUT});

    await this.waitForBoot(startupTimeout);

    log.info(`Simulator booted in ${Date.now() - startTime}ms`);
  }

  // TODO keep keychains
  async clean () {
    await this.endSimulatorDaemon();
    log.info(`Cleaning simulator ${this.udid}`);
    await simctl.eraseDevice(this.udid, 10000);
  }

  async scrubCustomApp (appFile, appBundleId) {
    return await this.cleanCustomApp (appFile, appBundleId, true);
  }

  async cleanCustomApp (appFile, appBundleId, scrub = false) {
    // if `scrub` is false, we want to clean by deleting the app and all
    // files associated with it
    // if `scrub` is true, we just want to delete the preferences and changed
    // files

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

  async getAppDirs (appFile, appBundleId, scrub = false) {
    let dirs = [];
    // iOS 8+ stores app data in two places,
    // iOS 7.1 has only one directory
    if (await this.getPlatformVersion() >= 8) {
      let data = await this.getAppDir(appBundleId);
      if (!data) return dirs;

      // the `Bundle` directory has the actual app in it. If we are just scrubbing,
      // we want this to stay. If we are cleaning we delete
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

  async endSimulatorDaemon () {
    // Looks for launchd daemons corresponding to the sim udid and tries to stop them cleanly
    // This prevents xcrun simctl erase hangs.
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

  async shutdown () {
    await killAllSimulators();
  }

  async delete () {
    await simctl.deleteDevice(this.udid);
  }

  async updateSettings (plist, updates) {
    return await settings.updateSettings(this, plist, updates);
  }

  async updateLocationSettings (bundleId, authorized) {
    return await settings.updateLocationSettings(this, bundleId, authorized);
  }

  async updateSafariSettings (updates) {
    await settings.updateSafariUserSettings(this, updates);
    await settings.updateSettings(this, 'mobileSafari', updates);
  }

  async updateLocale (language, locale, calendarFormat) {
    return await settings.updateLocale(this, language, locale, calendarFormat);
  }

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

  async removeApp (bundleId) {
    await simctl.removeApp(this.udid, bundleId);
  }

  async moveBuiltInApp (appName, appPath, newAppPath) {
    await safeRimRaf(newAppPath);
    await fs.copyFile(appPath, newAppPath);
    log.debug(`Copied '${appName}' to '${newAppPath}'`);

    await fs.rimraf(appPath);
    log.debug(`Temporarily deleted original app at '${appPath}'`);

    return [newAppPath, appPath];
  }

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

  // returns a promise that resolves when the ios simulator logs output a line matching `bootedIndicator`
  // times out after timeoutMs
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

  async enableCalendarAccess (bundleID) {
    await this.calendar.enableCalendarAccess(bundleID);
  }

  async disableCalendarAccess (bundleID) {
    await this.calendar.disableCalendarAccess(bundleID);
  }

  async hasCalendarAccess (bundleID) {
    return await this.calendar.hasCalendarAccess(bundleID);
  }

  async enrollTouchID () {
    await exec('osascript', ['-e', `
      activate application "Simulator"
      tell application "System Events"
        key code 17 using {control down, shift down, option down, command down}
      end tell
    `]);
  }

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
}

for (let [cmd, fn] of _.toPairs(extensions)) {
  SimulatorXcode6.prototype[cmd] = fn;
}

export default SimulatorXcode6;
export { SimulatorXcode6, BOOT_COMPLETED_EVENT };
