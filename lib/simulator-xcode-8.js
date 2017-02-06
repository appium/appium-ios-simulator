import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';


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
      await waitForCondition(async () => {
        try {
          let {stdout} = await exec('bash', ['-c',
            'ps axo command | grep Simulator | grep nsurlstoraged | grep -v bash | grep -v grep']);
          if (stdout.trim().length > 0) {
            // 'springboard' process should be the last one to start after boot
            // 'simctl launch' will block until this process is running
            await exec('bash', ['-c', `xcrun simctl launch ${this.udid} com.apple.springboard`]);
            return true;
          }
        } catch (e) {
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
          await exec('bash', ['-c', `xcrun simctl launch ${this.udid} com.apple.mobilesafari ${url}`]);
          return true;
        } catch (e) {
          log.error(e);
        }
        return false;
      }, {waitMs: SAFARI_STARTUP_TIMEOUT, intervalMs: 500});
    } catch (err) {
      log.errorAndThrow(`Safari cannot be started after ${process.hrtime(launchTimestamp)[0]} seconds`);
    }
    log.debug(`Safari has successfully started and opened ${url} in ${process.hrtime(launchTimestamp)[0]} seconds`);
  }

}

export default SimulatorXcode8;
