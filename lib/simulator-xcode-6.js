import path from 'path';
import * as simctl from 'node-simctl';
import log from './logger';
import support from 'appium-support';
import B from 'bluebird';
import _ from 'lodash';


function getRootDir() {
  let home = process.env.HOME;

  return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
}

class SimulatorXcode6 {

  constructor (udid, xcodeVersion) {
    this.xcodeVersion = xcodeVersion;
    this.udid = udid;

    this.keychainPath = path.resolve(this.getDir(), "Library", "Keychains");
  }

  getDir () {
    return path.resolve(getRootDir(), this.udid, 'data');
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
    await simctl.erase(this.udid);
  }


  // move built in app?

  // TODO cleaning functions

  // delete sim



}

export {SimulatorXcode6};
