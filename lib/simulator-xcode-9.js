import SimulatorXcode8 from './simulator-xcode-8';
import _ from 'lodash';
import path from 'path';
import { fs, plist } from 'appium-support';
import AsyncLock from 'async-lock';
import log from './logger';
import { shutdown as simctlShutdown, bootDevice, eraseDevice, spawn } from 'node-simctl';
import { waitForCondition, retryInterval } from 'asyncbox';
import { toBiometricDomainComponent, getDeveloperRoot } from './utils.js';

const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const startupLock = new AsyncLock();
const preferencesPlistGuard = new AsyncLock();
const ENROLLMENT_NOTIFICATION_RECEIVER = 'com.apple.BiometricKit.enrollmentChanged';

class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  /**
   * @typedef {Object} DevicePreferences
   * @property {?number} SimulatorExternalDisplay - TBD. Example value: 2.114
   * @property {?string} ChromeTint - TBD. Example value: ''
   * @property {?number} SimulatorWindowLastScale - Scale value for the particular Simulator window.
   *                                                1.0 means 100% scale.
   * @property {?string} SimulatorWindowOrientation - Simulator window orientation. Possible values are:
   *                                                  'Portrait', 'LandscapeLeft', 'PortraitUpsideDown' and 'LandscapeRight'.
   * @property {?number} SimulatorWindowRotationAngle - Window rotation angle. This value is expected to be in sync
   *                                                    with _SimulatorWindowOrientation_. The corresponding values are:
   *                                                    0, 90, 180 and 270.
   * @property {?string} SimulatorWindowCenter - The coordinates of Simulator's window center in pixels,
   *                                             for example '{-1294.5, 775.5}'.
   * @property {?boolean} ConnectHardwareKeyboard - Equals to 1 if hardware keyboard should be connected.
   *                                                Otherwise 0.
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
   *   - {string} scaleFactor: Any positive float value. 1.0 means 1:1 scale.
   *   Defines the window scale value for the UI client window for the current Simulator.
   *   Equals to `null` by default, which keeps the current scale unchanged.
   *   - {boolean} connectHardwareKeyboard: whether to connect the hardware keyboard to the
   *   Simulator UI client. Equals to `false` by default.
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
    // This option is necessary to make the Simulator window follow
    // the actual XCUIDevice orientation
    const commonPreferences = {
      RotateWindowWhenSignaledByGuest: true
    };
    if (_.isBoolean(opts.connectHardwareKeyboard)) {
      opts.devicePreferences.ConnectHardwareKeyboard = opts.connectHardwareKeyboard;
      commonPreferences.ConnectHardwareKeyboard = opts.connectHardwareKeyboard;
    }
    if (!_.isEmpty(opts.devicePreferences) || !_.isEmpty(commonPreferences)) {
      await this.updatePreferences(opts.devicePreferences, commonPreferences);
    }
    const bootSimulator = async () => {
      try {
        await retryInterval(3, 2000, async () => await bootDevice(this.udid));
      } catch (err) {
        log.warn(`'xcrun simctl boot ${this.udid}' command has returned non-zero code. The problem was: ${err.stderr}`);
      }
    };
    const waitForShutdown = async (waitMs = SIMULATOR_SHUTDOWN_TIMEOUT) => {
      try {
        await waitForCondition(async () => {
          const {state} = await this.stat();
          return state === 'Shutdown';
        }, {waitMs, intervalMs: 500});
      } catch (err) {
        throw new Error(`Simulator is not in 'Shutdown' state after ${waitMs}ms`);
      }
    };
    const startTime = process.hrtime();
    const shouldWaitForBoot = await startupLock.acquire(this.uiClientBundleId, async () => {
      const {state: serverState} = await this.stat();
      const isServerRunning = serverState === 'Booted';
      const uiClientPid = await this.getUIClientPid();
      if (opts.isHeadless) {
        if (isServerRunning && !uiClientPid) {
          log.info(`Simulator with UDID ${this.udid} is already booted in headless mode.`);
          return false;
        }
        if (await this.killUIClient({pid: uiClientPid})) {
          log.info(`Detected the Simulator UI client was running and killed it. Verifying the current Simulator state...`);
        }
        try {
          // Stopping the UI client kills all running servers for some early XCode versions. This is a known bug
          await waitForShutdown(3000);
        } catch (e) {
          const {state} = await this.stat();
          if (state !== 'Booted') {
            throw new Error(`Simulator with UDID ${this.udid} cannot be transitioned to headless mode. ` +
              `The recent state is '${state}'`);
          }
          return false;
        }
        log.info(`Booting Simulator with UDID ${this.udid} in headless mode. All UI-related capabilities are going to be ignored`);
        await bootSimulator();
      } else {
        if (isServerRunning && uiClientPid) {
          log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
          return false;
        }
        if (!['Shutdown', 'Booted'].includes(serverState)) {
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
        if (!uiClientPid) {
          await this.startUIClient(opts);
        }
      }
      return true;
    });

    if (shouldWaitForBoot) {
      await this.waitForBoot(opts.startupTimeout);
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
      const verificationPattern = /{-?\d+(\.\d+)?,-?\d+(\.\d+)?}/;
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
    await retryInterval(5, 500, simctlShutdown, this.udid);
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
   * @inheritdoc
   * @override
   * @private
   */
  async _activateWindow () {
    if (this.idb) {
      return await this.idb.focusSimulator();
    }
    log.warn(`Cannot focus Simulator window with idb. Defaulting to AppleScript`);
    const {name, sdk} = await this.stat();
    return `
      tell application "System Events"
        tell process "Simulator"
          set frontmost to false
          set frontmost to true
          click (menu item 1 where (its name contains "${name} " and its name contains "${sdk}")) of menu 1 of menu bar item "Window" of menu bar 1
        end tell
      end tell
    `;
  }

  /**
   * @inheritdoc
   * @override
   */
  async isBiometricEnrolled () {
    const {stdout} = await spawn(this.udid, [
      'notifyutil',
      '-g', ENROLLMENT_NOTIFICATION_RECEIVER
    ]);
    const match = (new RegExp(`${_.escapeRegExp(ENROLLMENT_NOTIFICATION_RECEIVER)}\\s+([01])`))
      .exec(stdout);
    if (!match) {
      throw new Error(`Cannot parse biometric enrollment state from '${stdout}'`);
    }
    log.info(`Current biometric enrolled state for ${this.udid} Simulator: ${match[1]}`);
    return match[1] === '1';
  }

  /**
   * @inheritdoc
   * @override
   */
  async enrollBiometric (isEnabled = true) {
    log.debug(`Setting biometric enrolled state for ${this.udid} Simulator to '${isEnabled ? 'enabled' : 'disabled'}'`);
    await spawn(this.udid, [
      'notifyutil',
      '-s', ENROLLMENT_NOTIFICATION_RECEIVER, isEnabled ? '1' : '0'
    ]);
    await spawn(this.udid, [
      'notifyutil',
      '-p', ENROLLMENT_NOTIFICATION_RECEIVER
    ]);
    if (await this.isBiometricEnrolled() !== isEnabled) {
      throw new Error(`Cannot set biometric enrolled state for ${this.udid} Simulator to '${isEnabled ? 'enabled' : 'disabled'}'`);
    }
  }

  /**
   * Sends a notification to match/not match the particular biometric.
   * @override
   *
   * @param {?boolean} shouldMatch [true] - Set it to true or false in order to emulate
   * matching/not matching the corresponding biometric
   * @param {?string} biometricName [touchId] - Either touchId or faceId (faceId is only available since iOS 11)
   */
  async sendBiometricMatch (shouldMatch = true, biometricName = 'touchId') {
    const domainComponent = toBiometricDomainComponent(biometricName);
    const domain = `com.apple.BiometricKit_Sim.${domainComponent}.${shouldMatch ? '' : 'no'}match`;
    await spawn(this.udid, [
      'notifyutil',
      '-p', domain
    ]);
    log.info(`Sent notification ${domain} to ${shouldMatch ? 'match' : 'not match'} ${biometricName} biometric ` +
      `for ${this.udid} Simulator`);
  }

  /**
   * @override
   */
  async getLaunchDaemonsRoot () {
    const devRoot = await getDeveloperRoot();
    return path.resolve(devRoot,
      'Platforms/iPhoneOS.platform/Developer/Library/CoreSimulator/Profiles/Runtimes/iOS.simruntime/Contents/Resources/RuntimeRoot/System/Library/LaunchDaemons');
  }

}

export default SimulatorXcode9;
