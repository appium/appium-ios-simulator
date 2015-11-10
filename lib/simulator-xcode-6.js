import path from 'path';
import * as simctl from 'node-simctl';
import { getPath as getXcodePath } from 'appium-xcode';
import log from './logger';
import { fs, rimraf } from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';
import { utils as instrumentsUtil } from 'appium-instruments';
import { killAllSimulators, endAllSimulatorDaemons } from './utils.js';
import { asyncmap, waitForCondition, retryInterval } from 'asyncbox';
import * as settings from './settings';
import { exec } from 'teen_process';
import  xcode from 'appium-xcode';
import { tailUntil } from './tail-until.js';


class SimulatorXcode6 {
  constructor (udid, xcodeVersion) {
    this.udid = String(udid);
    this.xcodeVersion = xcodeVersion;

    // platformVersion cannot be found initially, since getting it has side effects for
    // our logic for figuring out if a sim has been run
    // it will be set when it is needed
    this._platformVersion = null;

    this.keychainPath = path.resolve(this.getDir(), 'Library', 'Keychains');
    this.simulatorApp = 'iOS Simulator.app';

    this.appDataBundlePaths = null;
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

  /*
   * takes an `id`, which is either a bundleId (e.g., com.apple.mobilesafari)
   * or, for iOS 7.1, the app name without `.app` (e.g., MobileSafari)
   */
  async getAppDataDir (id, subDir = 'Data') {
    if (await this.isFresh()) {
      log.info('Attempted to get an app path from a fresh simulator ' +
               'quickly launching the sim to populate its directories');
      await this.launchAndQuit();
    }

    if (this.appDataBundlePaths === null) {
      this.appDataBundlePaths = await this.buildBundlePathMap(subDir);
    }
    return this.appDataBundlePaths[id];
  }

  /*
   * the xcode 6 simulators are really annoying, and bury the main app
   * directories inside directories just named with Hashes.
   * This function finds the proper directory by traversing all of them
   * and reading a metadata plist (Mobile Container Manager) to get the
   * bundle id.
   */
  async buildBundlePathMap (subDir = 'Data') {
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
        return {path: dir, bundleId: await readBundleId(dir)};
      };
    }

    let bundlePathPairs = await fs.readdir(applicationList).map(pathBundlePair).then((pairs) => {
      // reduce the list of path-bundle pairs to an object where bundleIds are mapped to paths
      return pairs.reduce((bundleMap, bundlePath) => {
        bundleMap[bundlePath.bundleId] = bundlePath.path;
        return bundleMap;
      }, {});
    });
    return bundlePathPairs;
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
    for (let [sdk, deviceArr] of _.pairs(devices)) {
      deviceArr = deviceArr.map((device) => {
        device.sdk = sdk;
        return device;
      });
      normalizedDevices = normalizedDevices.concat(deviceArr);
    }

    return _.findWhere(normalizedDevices, {udid: this.udid});
  }

  async isFresh () {
    // this is a best-bet heuristic for whether or not a sim has been booted
    // before. We usually want to start a simulator to "warm" it up, have
    // Xcode populate it with plists for us to manipulate before a real
    // test run.

    // if the following files don't exist, it hasn't been booted.
    // THIS IS NOT AN EXHAUSTIVE LIST

    let files = [
      'Library/ConfigurationProfiles',
      'Library/Cookies',
      'Library/Logs',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];
    let pv = await this.getPlatformVersion();
    if (pv !== '7.1') {
      if (pv[0] !== '9') {
        files.push('Library/DeviceRegistry.state');
      }
      files.push('Library/Preferences/com.apple.Preferences.plist');
    } else {
      files.push('Applications');
    }

    files = files.map((s) => {
      return path.resolve(this.getDir(), s);
    });

    let existence = await asyncmap(files, async (f) => { return fs.hasAccess(f); });

    existence = await B.all(existence); // will throw an error if an fs.stat call fails

    return _.compact(existence).length !== files.length;
  }

  async getBootedIndicatorString () {
    let indicator;
    switch (await this.getPlatformVersion()) {
      case '7.1':
      case '8.1':
      case '8.2':
      case '8.3':
        indicator = 'Migration complete (if performed)';
        break;
      case '8.4':
        indicator = 'MC: Finished cleaning up app configuration';
        break;
      case '9.0':
      case '9.1':
        indicator = 'System app "com.apple.springboard" finished startup';
        break;
      default:
        indicator = 'no boot indicator string available';
    }
    return indicator;
  }

  async run () {
    const OPEN_TIMEOUT = 3000;
    const STARTUP_TIMEOUT = 60 * 1000;
    const EXTRA_STARTUP_TIME = 2000;

    // start simulator
    let simulatorApp = path.resolve(await getXcodePath(), 'Applications', this.simulatorApp);
    let args = [simulatorApp, '--args', '-CurrentDeviceUDID', this.udid];
    log.info(`starting simulator with command: open ${args.join(' ')}`);
    let startTime = Date.now();
    await exec('open', args, {timeout: OPEN_TIMEOUT});

    // wait for the simulator to boot
    // waiting for the simulator status to be 'booted' isn't good enough
    // it claims to be booted way before finishing loading
    // let's tail the simulator system log until we see a magic line (this.bootedIndicator)
    let bootedIndicator = await this.getBootedIndicatorString();
    let simLog = path.resolve(this.getLogDir(), 'system.log');
    // we need to make sure log file exists before we can tail it
    await retryInterval(60, 200, async () => {
      if (!await fs.exists(simLog)) {
        throw new Error('not ready yet');
      }
    });

    await tailUntil(simLog, bootedIndicator, STARTUP_TIMEOUT);

    // so sorry, but we should wait another two seconds, just to make sure we've really started
    // we can't look for another magic log line, because they seem to be app-dependent (not system dependent)
    await B.delay(EXTRA_STARTUP_TIME);
    log.info(`Simulator booted in ${Date.now() - startTime}ms`);
  }

  // TODO keep keychains
  async clean () {
    await this.endSimulatorDaemon();
    log.info(`Cleaning simulator ${this.udid}`);
    await simctl.eraseDevice(this.udid);
  }

  async launchAndQuit (safari = false) {
    log.debug('Attempting to launch and quit the simulator, to create directory structure');
    log.debug(`Will launch with Safari? ${safari}`);

    if (safari) {
      await instrumentsUtil.quickLaunch(this.udid, 'com.apple.mobilesafari');
    } else {
      await this.run();
    }

    // wait for the system to create the files we will manipulate
    // need quite a high retry number, in order to accommodate iOS 7.1
    // locally, 7.1 averages 8.5 retries (from 6 - 12)
    //          8 averages 0.6 retries (from 0 - 2)
    //          9 averages 14 retries
    const RETRIES = 20;
    let retry;
    for (retry = 0; retry < RETRIES; retry++) {
      if (await this.isFresh()) {
        if (retry < RETRIES - 1) {
          log.debug('Simulator files not fully created. Waiting a bit');
          await B.delay(250);
        } else {
          log.error('Simulator files never fully created. Proceeding, but problems may ensue');
        }
      } else {
        break;
      }
    }

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
    try {
      await simctl.shutdown(this.udid);
    } catch (ign) {
      // this call sometimes fails if called twice
    }
    await this.endSimulatorDaemon();
    await endAllSimulatorDaemons();
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
    dirs.push(await this.getAppDataDir('com.apple.mobilesafari'));

    let pv = await this.getPlatformVersion();
    if (pv >= 8) {
      // get the bundle directory
      dirs.push(await this.getAppDataDir('com.apple.mobilesafari', 'Bundle'));
    }

    let deletePromises = [];
    for (let dir of dirs) {
      log.debug(`Deleting directory: '${dir}'`);
      deletePromises.push(rimraf(dir));
    }
    await B.all(deletePromises);
  }

  async cleanSafari (keepPrefs = true) {
    log.debug('Cleaning mobile safari data files');
    if (this.isFresh()) {
      log.info('Could not find Safari support directories to clean out old ' +
               'data. Probably there is nothing to clean out');
      return;
    }

    let libraryDir = path.resolve(this.getDir(), 'Library');
    let safariLibraryDir = path.resolve(await this.getAppDataDir('com.apple.mobilesafari'), 'Library');
    let filesToDelete = [
      'Caches/Snapshots/com.apple.mobilesafari',
      'Caches/com.apple.mobilesafari/Cache.db*',
      'Caches/com.apple.WebAppCache/*.db',
      'Safari',
      'WebKit/LocalStorage/*.*',
      'WebKit/GeolocationSites.plist',
      'Cookies/*.binarycookies'
    ];
    let deletePromises = [];

    for (let file of filesToDelete) {
      deletePromises.push(rimraf(path.resolve(libraryDir, file)));
      deletePromises.push(rimraf(path.resolve(safariLibraryDir, file)));
    }

    if (!keepPrefs) {
      deletePromises.push(rimraf(path.resolve(safariLibraryDir, 'Preferences/*.plist')));
    }

    await B.all(deletePromises);
  }

  static async _getDeviceStringPlatformVersion (platformVersion) {
    let reqVersion = platformVersion;
    if (!reqVersion) {
      reqVersion = await xcode.getMaxIOSSDK();
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
    log.debug(`Getting device string: ${JSON.stringify(opts)}`);

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

export default SimulatorXcode6;
