import { BOOT_COMPLETED_EVENT } from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import _ from 'lodash';
import log from './logger';
import { waitForCondition, retry } from 'asyncbox';
import { exec } from 'teen_process';
import { getAppContainer, openUrl as simctlOpenUrl, terminate, appInfo } from 'node-simctl';


// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;
const SAFARI_STARTUP_TIMEOUT = 25 * 1000;
const SPRINGBOARD_BUNDLE_ID = 'com.apple.springboard';
const MOBILE_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const UI_CLIENT_BUNDLE_ID = 'com.apple.iphonesimulator';
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
   * @return {string} Bundle identifier of Simulator UI client.
   */
  get uiClientBundleId () {
    return UI_CLIENT_BUNDLE_ID;
  }

  /**
   * Check the state of Simulator UI client.
   * @Override
   *
   * @return {boolean} True of if UI client is running or false otherwise.
   */
  async isUIClientRunning () {
    const args = ['-e', `tell application "System Events" to count processes whose bundle identifier is "${this.uiClientBundleId}"`];
    const {stdout} = await exec('osascript', args);
    const count = parseInt(stdout.trim(), 10);
    if (isNaN(count)) {
      log.errorAndThrow(`Cannot parse the count of running Simulator UI client instances from 'osascript ${args}' output: ${stdout}`);
    }
    log.debug(`The count of running Simulator UI client instances is ${count}`);
    return count >= 1;
  }

  /**
   * Kill the UI client if it is running.
   *
   * @param {boolean} force - Set it to true to send SIGKILL signal to Simulator process.
   *                          SIGTERM will be sent by default.
   * @return {boolean} True if the UI client was successfully killed or false
   *                   if it is not running.
   */
  async killUIClient (force = false) {
    const osascriptArgs = ['-e', `tell application "System Events" to unix id of processes whose bundle identifier is "${this.uiClientBundleId}"`];
    const {stdout} = await exec('osascript', osascriptArgs);
    if (!stdout.trim().length) {
      return false;
    }
    const killArgs = force ? ['-9', stdout.trim()] : [stdout.trim()];
    await exec('kill', killArgs);
    return true;
  }

  /**
   * Verify whether the particular application is installed on Simulator.
   * @override
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @return {boolean} True if the given application is installed.
   */
  async isAppInstalled (bundleId) {
    try {
      const appContainer = await getAppContainer(this.udid, bundleId, false);
      return appContainer.endsWith('.app');
    } catch (err) {
      // get_app_container subcommand fails for system applications,
      // so we try the hidden appinfo subcommand, which prints correct info for
      // system/hidden apps
      try {
        const info = await appInfo(this.udid, bundleId);
        return info.indexOf('ApplicationType') !== -1;
      } catch (e) {
        return false;
      }
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
   * @param {?function} bootFn - a function to boot the simulator if simctl reports that it is not booted.
   * @emits BOOT_COMPLETED_EVENT if the current Simulator is ready to accept simctl commands, like 'install'.
   */
  async waitForBoot (startupTimeout, bootFn = _.noop) {
    const startupTimestamp = process.hrtime();
    let lastError = null;

    try {
      let isOnBootCompletedEmitted = false;
      let tries = parseInt(startupTimeout / 10000, 10);
      await retry(tries, async () => {
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
            if (err.stderr && err.stderr.includes('Unable to lookup in current state: Shutdown') && _.isFunction(bootFn)) {
              log.debug(`Simulator in shutdown state. Retrying boot process`);
              await bootFn();
            }
          }
          return false;
        }, {waitMs: 10000, intervalMs: 1500});
      });
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
      if (await this.isRunning()) {
        await terminate(this.udid, MOBILE_SAFARI_BUNDLE_ID);
      }
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
   */
  async cleanCustomApp (appFile, appBundleId, scrub = false) {
    try {
      await terminate(this.udid, appBundleId);
    } catch (ign) {
      // ignore error
    }
    await super.cleanCustomApp(appFile, appBundleId, scrub);
  }

  /**
   * Perform Shake gesture on Simulator window via AppleScript.
   */
  async shake () {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          keystroke "z" using {control down, command down}
        end tell
      end tell
    `);
  }

  /**
   * Set custom geolocation parameters for the given Simulator using AppleScript.
   *
   * @param {string} latitude - The latitude value, which is going to be entered
   *   into the corresponding edit field, for example '39,0006'.
   * @param {string} longitude - The longitude value, which is going to be entered
   *   into the corresponding edit field, for example '19,0068'.
   * @returns {boolean} True if the given parameters have correct format and were successfully accepted.
   */
  async setGeolocation (latitude, longitude) {
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set featureName to "Custom Location"
          set dstMenuItem to menu item (featureName & "…") of menu 1 of menu item "Location" of menu 1 of menu bar item "Debug" of menu bar 1
          click dstMenuItem
          delay 1
          set value of text field 1 of window featureName to "${latitude}"
          delay 0.5
          set value of text field 2 of window featureName to "${longitude}"
          delay 0.5
          click button "OK" of window featureName
          delay 0.5
          set isInvisible to (not (exists (window featureName)))
        end tell
      end tell
    `);
    log.debug(`Geolocation parameters dialog accepted: ${output}`);
    return _.isString(output) && output.trim() === 'true';
  }
}

export default SimulatorXcode8;
