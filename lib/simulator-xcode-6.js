import path from 'path';
import * as simctl from 'node-simctl';
import log from './logger';
import { fs, util } from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';
import { utils as instrumentsUtil } from 'appium-instruments';
import { killAllSimulators } from './util.js';
import bplistParser from 'bplist-parser';

let parseFile = B.promisify(bplistParser.parseFile);

function getRootDir() {
  let home = process.env.HOME;

  return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
}

class SimulatorXcode6 {

  constructor (udid, xcodeVersion) {
    this.xcodeVersion = xcodeVersion;
    this.udid = udid;

    //TODO assert that udid is a valid sim
    this.keychainPath = path.resolve(this.getDir(), "Library", "Keychains");
  }

  //TODO default constructor with no args should create a sim with some defaults

  getDir () {
    return path.resolve(getRootDir(), this.udid, 'data');
  }

  // the xcode 6 simulators are really annoying, and bury the main app
  // directories inside directories just named with Hashes.
  // This function finds the proper directory by traversing all of them
  // and reading a metadata plist (Mobile Container Manager)to get the
  // bundle id.
  async getAppDataDir (bundleId) {

    if (await this.isFresh()) {
      log.info('Attempted to get an app path from a fresh simulator ' +
               'quickly launching the sim to populate its directories');
      await this.launchAndQuit();
    }

    const applicationList = path.resolve(this.getDir(), 'Containers', 'Data', 'Application');

    async function readBundleId (dir) {
      let plist = path.resolve(dir, '.com.apple.mobile_container_manager.metadata.plist');
      let metadata = await parseFile(plist);
      return metadata[0].MCMMetadataIdentifier;
    }
    async function bundlePathPair (dir) {
      dir = path.resolve(applicationList, dir);
      return {path: dir, bundleId: await readBundleId(dir)};
    }

    let bundleIdMap = await fs.readdir(applicationList).map(bundlePathPair).then((pairs) => {
      return pairs.reduce((a,b) => {
        a[b.bundleId] = b.path;
        return a;
      }, {});
    });

    return bundleIdMap[bundleId];
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

    let ret = _.findWhere(normalizedDevices, {udid: this.udid});

    return ret;
  }

  async isFresh () {
    // this is a best-bet heuristic for wether or not a sim has been booted
    // before. We usually want to start a simulator to "warm" it up, have
    // Xcode populate it with plists for us to manupilate before a real
    // test run.

    // if the following files don't exist, it hasn't been booted.
    // THIS IS NOT AN EXHAUSTIVE LIST

    let files = [
      'Library/ConfigurationProfiles',
      'Library/Cookies',
      'Library/DeviceRegistry.state',
      'Library/Logs',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.Preferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];

    files = files.map((s) => {
      return path.resolve(this.getDir(), s);
    });

    let existence = files.map((f) => {
      return util.hasAccess(f);
    });

    existence = await B.all(existence); // will throw an error if an fs.stat call fails

    return _.compact(existence).length !== files.length;
  }

  // setLocale (language, locale, calendarFormat) {
  //
  // }
  //
  // setPreferences () {
  //
  // }
  //
  // setLocationPreferences () {
  //
  // }
  //
  // setSafariPreferences () {
  //
  // }

  // TODO keep keychains
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await simctl.eraseDevice(this.udid);
  }

  async launchAndQuit () {
    // launch
    await instrumentsUtil.quickLaunch(this.udid);
    // and quit
    await this.shutdown();
    await killAllSimulators();
  }

  async shutdown () {
    await simctl.shutdown(this.udid);
  }

  async delete () {
    await simctl.deleteDevice(this.udid);
  }

  //cleanCustomApp? - probably not needed, we just use simctl erase to clean



  //updateSettings
  //updateLocationSettings
  //updateSafariSettings


}

export {SimulatorXcode6};
