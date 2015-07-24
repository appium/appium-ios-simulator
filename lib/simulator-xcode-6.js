import path from 'path';
import * as simctl from 'node-simctl';
import log from './logger';
import support from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';
import { utils as instrumentsUtil } from 'appium-instruments';
import { killAllSimulators } from './util.js';


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
      return support.util.fileExists(f);
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

  // move built in app?

  // TODO cleaning functions

  // delete sim



}

export {SimulatorXcode6};
