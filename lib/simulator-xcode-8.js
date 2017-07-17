import { BOOT_COMPLETED_EVENT } from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';
import { getAppContainer, openUrl as simctlOpenUrl, terminate } from 'node-simctl';


// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;
const SAFARI_STARTUP_TIMEOUT = 25 * 1000;
const SPRINGBOARD_BUNDLE_ID = 'com.apple.springboard';
const MOBILE_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const PROCESS_LAUNCH_OK_PATTERN = (bundleId) => new RegExp(`${bundleId.replace('.', '\\.')}:\\s+\\d+`);

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

  get startupPollBundleId () {
    return SPRINGBOARD_BUNDLE_ID;
  }

  get startupTimeout () {
    return STARTUP_TIMEOUT;
  }

  async waitForBoot (startupTimeout) {
    const startupTimestamp = process.hrtime();
    let lastError = null;
    try {
      let isOnBootCompletedEmitted = false;
      await waitForCondition(async () => {
        try {
          // 'springboard' process should be the last one to start after boot
          // 'simctl launch' will block until this process is running or fail if booting is still in progress
          const {stdout} = await exec('xcrun', ['simctl', 'launch', this.udid, this.startupPollBundleId]);
          if (PROCESS_LAUNCH_OK_PATTERN(this.startupPollBundleId).test(stdout)) {
            if (!isOnBootCompletedEmitted) {
              isOnBootCompletedEmitted = true;
              this.emit(BOOT_COMPLETED_EVENT);
            }

            return true;
          }
        } catch (err) {
          lastError = err.stderr || err.message;
        }
        return false;
      }, {waitMs: startupTimeout, intervalMs: 500});
    } catch (err) {
      log.errorAndThrow(`Simulator is not booted after ${process.hrtime(startupTimestamp)[0]} seconds because of ` +
                        `"${lastError ? "`${lastError}`" : 'an unknown error'}"`);
    }
  }

  async openUrl (url) {
    if (!await this.isRunning()) {
      throw new Error(`Tried to open ${url}, but Simulator is not in Booted state`);
    }
    const launchTimestamp = process.hrtime();
    let lastError = null;
    try {
      await waitForCondition(async () => {
        try {
          // This is to make sure Safari is already running
          const {stdout} = await exec('xcrun', ['simctl', 'launch', this.udid, MOBILE_SAFARI_BUNDLE_ID]);
          if (PROCESS_LAUNCH_OK_PATTERN(MOBILE_SAFARI_BUNDLE_ID).test(stdout)) {
            await simctlOpenUrl(this.udid, url);
            return true;
          }
        } catch (err) {
          log.error(`Failed to open '${url}' in Safari. Retrying...`);
          lastError = err.stderr || err.message;
        }
        return false;
      }, {waitMs: SAFARI_STARTUP_TIMEOUT, intervalMs: 500});
    } catch (err) {
      log.errorAndThrow(`Safari cannot open '${url}' after ${process.hrtime(launchTimestamp)[0]} seconds ` +
                        `because of ${lastError ? "`${lastError}`" : 'an unknown error'}`);
    }
    log.debug(`Safari has successfully opened '${url}' in ${process.hrtime(launchTimestamp)[0]} seconds`);
  }

  async cleanSafari (keepPrefs = true) {
    try {
      await terminate(this.udid, MOBILE_SAFARI_BUNDLE_ID);
    } catch (ign) {
      // ignore error
    }
    await super.cleanSafari(keepPrefs);
  }

  async cleanCustomApp (appFile, appBundleId, scrub = false) {
    try {
      await terminate(this.udid, appBundleId);
    } catch (ign) {
      // ignore error
    }
    await super.cleanCustomApp(appFile, appBundleId, scrub);
  }

}

export default SimulatorXcode8;
