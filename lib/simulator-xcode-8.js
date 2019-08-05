import { BOOT_COMPLETED_EVENT } from './simulator-xcode-6';
import SimulatorXcode7 from './simulator-xcode-7';
import _ from 'lodash';
import log from './logger';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';
import { getAppContainer, openUrl as simctlOpenUrl, terminate,
         appInfo, spawn, startBootMonitor } from 'node-simctl';

// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;
const SAFARI_STARTUP_TIMEOUT = 25 * 1000;
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
    this._idb = null;
  }

  /**
   * IDB instance setter
   *
   * @param {IDB} value
   */
  set idb (value) {
    this._idb = value;
  }

  /**
   * @return {IDB} idb instance
   */
  get idb () {
    return this._idb;
  }

  /**
   * @typedef {Object} killOpts
   * @property {?number|string} pid - Process id of the UI Simulator window
   * @property {number|string} signal [2] - The signal number to send to the
   * `kill` command
   */

  /**
   * Kill the UI client if it is running.
   *
   * @param {?killOpts} opts
   * @return {boolean} True if the UI client was successfully killed or false
   *                   if it is not running.
   * @throws {Error} If sending the signal to the client process fails
   */
  async killUIClient (opts = {}) {
    let {
      pid,
      signal = 2,
    } = opts;
    pid = pid || await this.getUIClientPid();
    if (!pid) {
      return false;
    }

    log.debug(`Sending ${signal} kill signal to Simulator UI client with PID ${pid}`);
    try {
      await exec('kill', [`-${signal}`, pid]);
      return true;
    } catch (e) {
      if (e.code === 1) {
        return false;
      }
      throw new Error(`Cannot kill the Simulator UI client. Original error: ${e.message}`);
    }
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
        return info.includes('ApplicationType');
      } catch (e) {
        return false;
      }
    }
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
    await startBootMonitor(this.udid, {timeout: startupTimeout});
    this.emit(BOOT_COMPLETED_EVENT);
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
   * Perform Shake gesture on Simulator window.
   */
  async shake () {
    log.info(`Performing shake gesture on ${this.udid} Simulator`);
    await spawn(this.udid, [
      'notifyutil',
      '-p', 'com.apple.UIKit.SimulatorShake'
    ]);
  }

  /**
   * @inheritdoc
   * @override
   * @private
   */
  async _activateWindow () {
    if (this.idb) {
      return await this.idb.focusSimulator();
    }
    log.warn(`Cannot focus Simulator window with idb. Defaulting to AppleScript`);
    return await super._activateWindow();
  }

  /**
   * @inheritdoc
   * @override
   */
  async isBiometricEnrolled () {
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
        end tell
      end tell
    `);
    log.debug(`Touch ID enrolled state: ${output}`);
    return _.isString(output) && output.trim() === 'true';
  }

  /**
   * @inheritdoc
   * @override
   */
  async enrollBiometric (isEnabled = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
          if ${isEnabled ? 'not ' : ''}isChecked then
            click dstMenuItem
          end if
        end tell
      end tell
    `);
  }

  /**
   * @inheritdoc
   * @override
   */
  async sendBiometricMatch (shouldMatch = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "${shouldMatch ? 'Matching Touch' : 'Non-matching Touch'}" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          click dstMenuItem
        end tell
      end tell
    `);
  }

  /**
   * Set custom geolocation parameters for the given Simulator using AppleScript.
   *
   * @param {string|number} latitude - The latitude value, which is going to be entered
   *   into the corresponding edit field, for example '39,0006'.
   * @param {string|number} longitude - The longitude value, which is going to be entered
   *   into the corresponding edit field, for example '19,0068'.
   * @returns {boolean} True if the given parameters have correct format and were successfully accepted.
   * @throws {Error} If there was an error while setting the location
   */
  async setGeolocation (latitude, longitude) {
    if (this.idb) {
      await this.idb.setLocation(latitude, longitude);
      return true;
    }
    log.warn(`Cannot set geolocation with idb, because it is not installed. Defaulting to AppleScript`);
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set featureName to "Custom Location"
          set dstMenuItem to menu item (featureName & "…") of menu 1 of menu item "Location" of menu 1 of menu bar item "Debug" of menu bar 1
          click dstMenuItem
          delay 1
          set value of text field 1 of window featureName to ${latitude} as string
          delay 0.5
          set value of text field 2 of window featureName to ${longitude} as string
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
