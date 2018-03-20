import SimulatorXcode8 from './simulator-xcode-8';
import _ from 'lodash';
import path from 'path';
import { fs, plist } from 'appium-support';
import AsyncLock from 'async-lock';
import log from './logger';
import { shutdown as simctlShutdown, bootDevice, eraseDevice } from 'node-simctl';
import { waitForCondition } from 'asyncbox';


const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const startupLock = new AsyncLock();
const preferencesPlistGuard = new AsyncLock();

class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  /**
   * @typedef {Object} DevicePreferences
   * @property {number} SimulatorExternalDisplay - TBD. Example value: 2.114
   * @property {string} ChromeTint - TBD. Example value: ''
   * @property {number} SimulatorWindowLastScale - Scale value for the particular Simulator window.
   *                                               1.0 means 100% scale.
   * @property {string} SimulatorWindowOrientation - Simulator window orientation. Possible values are:
   *                                                 'Portrait', 'LandscapeLeft', 'PortraitUpsideDown' and 'LandscapeRight'.
   * @property {number} SimulatorWindowRotationAngle - Window rotation angle. This value is expected to be in sync
   *                                                   with _SimulatorWindowOrientation_. The corresponding values are:
   *                                                   0, 90, 180 and 270.
   * @property {string} SimulatorWindowCenter - The coordinates of Simulator's window center in pixels,
   *                                            for example '{-1294.5, 775.5}'.
   */

  /**
   * @typedef {Object} CommonPreferences
   * @property {boolean} ConnectHardwareKeyboard - Whether to connect hardware keyboard
   */

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running and the current UI state matches to `isHeadless` option.
   * @override
   *
   * @param {object} opts - One or more of available Simulator options:
   *   - {string} scaleFactor: can be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   *   Defines the window scale value for the UI client window for the current Simulator.
   *   Equals to null by default, which keeps the current scale unchanged.
   *   - {boolean} connectHardwareKeyboard: whether to connect the hardware keyboard to the
   *   Simulator UI client. Equals to false by default.
   *   - {number} startupTimeout: number of milliseconds to wait until Simulator booting
   *   process is completed. The default timeout will be used if not set explicitly.
   *   - {boolean} isHeadless: whether to start the Simulator in headless mode (with UI
   *   client invisible). `false` by default.
   *   - {DevicePreferences} devicePreferences: preferences of the newly created Simulator
   *   device
   */
  async run (opts = {}) {
    opts = Object.assign({
      devicePreferences: {},
      isHeadless: false,
      startupTimeout: this.startupTimeout,
    }, opts);
    if (opts.scaleFactor) {
      opts.devicePreferences.SimulatorWindowLastScale = parseFloat(opts.scaleFactor);
    }
    const commonPreferences = _.isBoolean(opts.connectHardwareKeyboard) ?
      {ConnectHardwareKeyboard: opts.connectHardwareKeyboard} :
      {};
    if (!_.isEmpty(opts.devicePreferences) || !_.isEmpty(commonPreferences)) {
      await this.updatePreferences(opts.devicePreferences, commonPreferences);
    }
    const bootSimulator = async () => {
      try {
        await bootDevice(this.udid);
      } catch (err) {
        log.warn(`'xcrun simctl boot ${this.udid}' command has returned non-zero code. The problem was: ${err.stderr}`);
      }
    };
    const waitForShutdown = async () => {
      await waitForCondition(async () => {
        const {state} = await this.stat();
        return state === 'Shutdown';
      }, {waitMs: SIMULATOR_SHUTDOWN_TIMEOUT, intervalMs: 500});
    };
    let shouldWaitForBoot = true;
    const startTime = process.hrtime();
    await startupLock.acquire(this.uiClientBundleId, async () => {
      const stat = await this.stat();
      const serverState = stat.state;
      const isServerRunning = serverState === 'Booted';
      const isUIClientRunning = await this.isUIClientRunning();
      if (opts.isHeadless) {
        if (isServerRunning && !isUIClientRunning) {
          log.info(`Simulator with UDID ${this.udid} already booted in headless mode.`);
          shouldWaitForBoot = false;
          return;
        }
        if (await this.killUIClient()) {
          // Stopping the UI client also kills all running servers. Sad but true
          log.info(`Detected the UI client was running and killed it. Verifying the Simulator is in Shutdown state...`);
          await waitForShutdown();
        }
        log.info(`Booting Simulator with UDID ${this.udid} in headless mode. All UI-related capabilities are going to be ignored.`);
        await bootSimulator();
      } else {
        if (isServerRunning && isUIClientRunning) {
          log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
          shouldWaitForBoot = false;
          return;
        }
        if (['Shutdown', 'Booted'].indexOf(serverState) === -1) {
          if (serverState !== 'Shutting Down') {
            log.info(`Simulator ${this.udid} is in '${serverState}' state. Trying to shutdown...`);
            try {
              await this.shutdown();
            } catch (err) {
              log.warn(`Error on Simulator shutdown: ${err.message}`);
            }
          }
          await waitForShutdown();
        }
        log.info(`Booting Simulator with UDID ${this.udid}...`);
        await bootSimulator();
        if (!isUIClientRunning) {
          await this.startUIClient(opts);
        }
      }
    });

    if (shouldWaitForBoot) {
      await this.waitForBoot(opts.startupTimeout, bootSimulator);
      log.info(`Simulator with UDID ${this.udid} booted in ${process.hrtime(startTime)[0]} seconds`);
    }
  }

  /**
   * Perform verification of device preferences correctness.
   *
   * @param {DevicePreferences} prefs [{}] - The preferences to be verified
   * @throws {Error} If any of the given preference values does not match the expected
   * format.
   */
  verifyDevicePreferences (prefs = {}) {
    if (_.isEmpty(prefs)) {
      return;
    }

    if (!_.isUndefined(prefs.SimulatorWindowLastScale)) {
      if (!_.isNumber(prefs.SimulatorWindowLastScale) || prefs.SimulatorWindowLastScale <= 0) {
        log.errorAndThrow(`SimulatorWindowLastScale is expected to be a positive float value. ` +
          `'${prefs.SimulatorWindowLastScale}' is assigned instead.`);
      }
    }

    if (!_.isUndefined(prefs.SimulatorWindowCenter)) {
      // https://regex101.com/r/2ZXOij/2
      const verificationPattern = /\{\-?\d+(\.\d+)?,\-?\d+(\.\d+)?\}/;
      if (!_.isString(prefs.SimulatorWindowCenter) || !verificationPattern.test(prefs.SimulatorWindowCenter)) {
        log.errorAndThrow(`SimulatorWindowCenter is expected to match "{floatXPosition,floatYPosition}" format (without spaces). ` +
          `'${prefs.SimulatorWindowCenter}' is assigned instead.`);
      }
    }

    if (!_.isUndefined(prefs.SimulatorWindowOrientation)) {
      const acceptableValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      if (acceptableValues.indexOf(prefs.SimulatorWindowOrientation) === -1) {
        log.errorAndThrow(`SimulatorWindowOrientation is expected to be one of ${acceptableValues}. ` +
          `'${prefs.SimulatorWindowOrientation}' is assigned instead.`);
      }
    }

    if (!_.isUndefined(prefs.SimulatorWindowRotationAngle)) {
      if (!_.isNumber(prefs.SimulatorWindowRotationAngle)) {
        log.errorAndThrow(`SimulatorWindowRotationAngle is expected to be a valid number. ` +
          `'${prefs.SimulatorWindowRotationAngle}' is assigned instead.`);
      }
    }
  }

  /**
   * Update the common iOS Simulator preferences file with new values.
   * It is necessary to restart the corresponding Simulator before
   * these changes are applied.
   *
   * @param {DevicePreferences} devicePrefs [{}] - The mapping, which represents new device preference values
   *                                               for the given Simulator.
   * @param {CommonPreferences} commonPrefs [{}] - The mapping, which represents new common preference values
   *                                               for all Simulators.
   * @return {boolean} True if the preferences were successfully updated.
   */
  async updatePreferences (devicePrefs = {}, commonPrefs = {}) {
    if (!_.isEmpty(devicePrefs)) {
      log.debug(`Setting preferences of ${this.udid} Simulator to ${JSON.stringify(devicePrefs)}`);
    }
    if (!_.isEmpty(commonPrefs)) {
      log.debug(`Setting common Simulator preferences to ${JSON.stringify(commonPrefs)}`);
    }
    const homeFolderPath = process.env.HOME;
    if (!homeFolderPath) {
      log.warn(`Cannot get the path to HOME folder from the process environment. ` +
        `Ignoring Simulator preferences update.`);
      return false;
    }
    this.verifyDevicePreferences(devicePrefs);
    const plistPath = path.resolve(homeFolderPath, 'Library', 'Preferences', 'com.apple.iphonesimulator.plist');
    if (!await fs.hasAccess(plistPath)) {
      log.warn(`Simulator preferences file '${plistPath}' is not accessible. ` +
        `Ignoring Simulator preferences update.`);
      return false;
    }
    let newPrefs = {};
    if (!_.isEmpty(devicePrefs)) {
      newPrefs.DevicePreferences = {[this.udid.toUpperCase()]: devicePrefs};
    }
    newPrefs = _.merge(newPrefs, commonPrefs);
    return await preferencesPlistGuard.acquire(SimulatorXcode9.name, async () => {
      try {
        const currentPlistContent = await plist.parsePlistFile(plistPath);
        await plist.updatePlistFile(plistPath, _.merge(currentPlistContent, newPrefs), true);
        log.debug(`Updated ${this.udid} Simulator preferences at '${plistPath}' with ${JSON.stringify(newPrefs)}`);
        return true;
      } catch (e) {
        log.warn(`Cannot update ${this.udid} Simulator preferences at '${plistPath}'. ` +
                 `Try to delete the file manually in order to reset it. Original error: ${e.message}`);
        return false;
      }
    });
  }

  /**
   * Shut down the current Simulator.
   * @override
   */
  async shutdown () {
    const {state} = await this.stat();
    if (state === 'Shutdown') {
      return;
    }
    await simctlShutdown(this.udid);
  }

  /**
   * Reset the current Simulator to the clean state.
   * @override
   */
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await eraseDevice(this.udid, 10000);
  }

  /**
   * Generate Apple script, which selects the necessary Simulator window
   * if multiple windows are opened.
   * @override
   */
  async generateWindowActivationScript () {
    const {name, sdk} = await this.stat();
    return `
      tell application "System Events"
        tell process "Simulator"
          set frontmost to false
          set frontmost to true
          click (menu item 1 where (its name contains "${name} -" and its name contains "${sdk}")) of menu 1 of menu bar item "Window" of menu bar 1
        end tell
      end tell
    `;
  }

  /**
   * Get the current state of Touch ID Enrollment feature.
   * @override
   */
  async isTouchIDEnrolled () {
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Enrolled" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
        end tell
      end tell
    `);
    log.debug(`Touch ID enrolled state: ${output}`);
    return _.isString(output) && output.trim() === 'true';
  }

  /**
   * Execute a special Apple script, which changes Touch ID feature testing in Simulator UI client.
   * @override
   */
  async enrollTouchID (isEnabled = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Enrolled" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
          if ${isEnabled ? 'not ' : ''}isChecked then
            click dstMenuItem
          end if
        end tell
      end tell
    `);
  }
}

export default SimulatorXcode9;
