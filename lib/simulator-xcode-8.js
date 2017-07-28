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

  /**
   * Verify whether the particular application is installed on Simulator.
   * @override
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @param {string} appFule - Application name minus ".app" (for iOS 7.1)
   * @return {boolean} True if the given application is installed
   */
  async isAppInstalled (bundleId) {
    try {
      let appContainer = await getAppContainer(this.udid, bundleId, false);
      return appContainer.endsWith('.app');
    } catch (err) {
      return false;
    }
  }

  /**
   * @return {string} Application bundle id, which signals that Simulator booting is
   * competed if it is running.
   */
  get startupPollBundleId () {
    return SPRINGBOARD_BUNDLE_ID;
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
   * @override
   *
   * @param {number} startupTimeout - the number of milliseconds to wait until booting is completed.
   * @emits BOOT_COMPLETED_EVENT if the current Simulator is ready to accept simctl commands, like 'install'.
   */
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
      log.errorAndThrow(`Simulator is not booted after ${process.hrtime(startupTimestamp)[0]} seconds ` +
                        `because of: ${lastError || 'an unknown error'}`);
    }
  }

  /**
   * Open the given URL in mobile Safari browser.
   * The browser will be started automatically if it is not running.
   * @override
   *
   * @param {string} url - The URL to be opened.
   */
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
                        `because of: ${lastError || 'an unknown error'}`);
    }
    log.debug(`Safari has successfully opened '${url}' in ${process.hrtime(launchTimestamp)[0]} seconds`);
  }

  /**
   * Clean up the directories for mobile Safari.
   * @override
   *
   * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
   */
  async cleanSafari (keepPrefs = true) {
    try {
      await terminate(this.udid, MOBILE_SAFARI_BUNDLE_ID);
    } catch (ign) {
      // ignore error
    }
    await super.cleanSafari(keepPrefs);
  }

  /**
   * Clean/scrub the particular application on Simulator.
   * @override
   *
   * @param {string} appFile - Application name minus ".app".
   * @param {string} appBundleId - Bundle identifier of the application.
   * @param {boolean} scrub - If `scrub` is false, we want to clean by deleting the app and all
   *   files associated with it. If `scrub` is true, we just want to delete the preferences and
   *   changed files.
   * @return {array} Array of deletion promises.
   */
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
