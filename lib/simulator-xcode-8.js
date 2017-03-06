import { BOOT_COMPLETED_EVENT } from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';
import { getAppContainer } from 'node-simctl';


// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;

class SimulatorXcode8 extends SimulatorXcode7 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    // list of files to check for when seeing if a simulator is "fresh"
    // (meaning it has never been booted).
    // If these files are present, we assume it's been successfully booted
    this.isFreshFiles = [
      'Library/Cookies',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];
  }

  async isAppInstalled (bundleId) {
    try {
      let appContainer = await getAppContainer(this.udid, bundleId, false);
      return appContainer.endsWith('.app');
    } catch (err) {
      return false;
    }
  }

  get startupTimeout () {
    return STARTUP_TIMEOUT;
  }

  async waitForBoot (startupTimeout) {
    // wait for the simulator to boot
    // waiting for the simulator status to be 'booted' isn't good enough
    // it claims to be booted way before finishing loading
    // let's wait for the magic nsurlstoraged process, which signals the booting has been completed
    const startupTimestamp = process.hrtime();
    try {
      let isOnBootCompletedEmitted = false;
      await waitForCondition(async () => {
        try {
          let {stdout} = await exec('bash', ['-c',
            'ps axo command | grep Simulator | grep nsurlstoraged | grep -v bash | grep -v grep']);
          if (stdout.trim().length > 0) {
            if (!isOnBootCompletedEmitted) {
              isOnBootCompletedEmitted = true;
              this.emit(BOOT_COMPLETED_EVENT);
            }
            // 'springboard' process should be the last one to start after boot
            // 'simctl launch' will block until this process is running
            await exec('xcrun', ['simctl', 'launch', this.udid, 'com.apple.springboard']);
            return true;
          }
        } catch (ign) {
          // Continue iteration in case of error
        }
        return false;
      }, {waitMs: startupTimeout, intervalMs: 500});
    } catch (err) {
      log.errorAndThrow(`Simulator is not booted after ${process.hrtime(startupTimestamp)[0]} seconds`);
    }
  }

  async openUrl (url) {
    const SAFARI_STARTUP_TIMEOUT = 15 * 1000;

    if (!await this.isRunning()) {
      throw new Error(`Tried to open ${url}, but Simulator is not in Booted state`);
    }
    const launchTimestamp = process.hrtime();
    try {
      await waitForCondition(async () => {
        try {
          let stdout;
          try {
            // jshint ignore:start
            ({stdout = ''} = await exec('bash',
              ['-c', 'ps axo command | grep Simulator | grep MobileSafari | grep -v bash | grep -v grep']));
            // jshint ignore:end
          } catch (err) {
            // error code 1 can be thrown in normal situations when nothing is found
            if (err.code !== 1) {
              throw err;
            }
            stdout = '';
          }
          if (stdout.trim().length > 0) {
            // Safari is already running. Open the url in the other tab
            await exec('xcrun', ['simctl', 'openurl', this.udid, url]);
          } else {
            // Execute new Safari instance and open the url immediately
            await exec('xcrun', ['simctl', 'launch', this.udid, 'com.apple.mobilesafari', url]);
          }
          return true;
        } catch (e) {
          log.error(`Failed to open '${url}' in Safari. Retrying...`);
        }
        return false;
      }, {waitMs: SAFARI_STARTUP_TIMEOUT, intervalMs: 500});
    } catch (err) {
      log.errorAndThrow(`Safari cannot open '${url}' after ${process.hrtime(launchTimestamp)[0]} seconds`);
    }
    log.debug(`Safari has successfully opened '${url}' in ${process.hrtime(launchTimestamp)[0]} seconds`);
  }

}

export default SimulatorXcode8;
