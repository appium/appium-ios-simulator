import SimulatorXcode8 from './simulator-xcode-8';
import _ from 'lodash';
import path from 'path';
import { fs, timing } from 'appium-support';
import AsyncLock from 'async-lock';
import log from './logger';
import { waitForCondition } from 'asyncbox';
import { toBiometricDomainComponent, getDeveloperRoot } from './utils.js';
import { NSUserDefaults, generateDefaultsCommandArgs } from './defaults-utils';
import B from 'bluebird';
import { EventEmitter } from 'events';

const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const startupLock = new AsyncLock();
const preferencesPlistGuard = new AsyncLock();
const ENROLLMENT_NOTIFICATION_RECEIVER = 'com.apple.BiometricKit.enrollmentChanged';
const DOMAIN_KEYBOARD_PREFERENCES = 'com.apple.keyboard.preferences';

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
   * @typedef {Object} RunOptions
   * @property {string} scaleFactor: Any positive float value. 1.0 means 1:1 scale.
   * Defines the window scale value for the UI client window for the current Simulator.
   * Equals to `null` by default, which keeps the current scale unchanged.
   * @property {boolean} connectHardwareKeyboard: whether to connect the hardware keyboard to the
   * Simulator UI client. Equals to `false` by default.
   * @property {number} startupTimeout: number of milliseconds to wait until Simulator booting
   * process is completed. The default timeout will be used if not set explicitly.
   * @property {boolean} isHeadless: whether to start the Simulator in headless mode (with UI
   * client invisible). `false` by default.
   * @property {?boolean} tracePointer [false] - Whether to highlight touches on Simulator
   * screen. This is helpful while debugging automated tests or while observing the automation
   * recordings.
   * @property {string} pasteboardAutomaticSync ['off'] - Whether to disable pasteboard sync with the
   * Simulator UI client or respect the system wide preference. 'on', 'off', or 'system' is available.
   * The sync increases launching simulator process time, but it allows system to sync pasteboard
   * with simulators. Follows system-wide preference if the value is 'system'.
   * Defaults to 'off'.
   * @property {DevicePreferences} devicePreferences: preferences of the newly created Simulator
   * device
   */

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running and the current UI state matches to `isHeadless` option.
   * @override
   *
   * @param {RunOptions} opts - One or more of available Simulator options
   */
  async run (opts = {}) {
    opts = _.cloneDeep(opts);
    _.defaultsDeep(opts, {
      devicePreferences: {},
      isHeadless: false,
      startupTimeout: this.startupTimeout,
    });

    if (opts.scaleFactor) {
      opts.devicePreferences.SimulatorWindowLastScale = parseFloat(opts.scaleFactor);
    }
    // This option is necessary to make the Simulator window follow
    // the actual XCUIDevice orientation
    const commonPreferences = {
      RotateWindowWhenSignaledByGuest: true
    };
    if (_.isBoolean(opts.connectHardwareKeyboard) || _.isNil(opts.connectHardwareKeyboard)) {
      opts.devicePreferences.ConnectHardwareKeyboard = opts.connectHardwareKeyboard ?? false;
      commonPreferences.ConnectHardwareKeyboard = opts.connectHardwareKeyboard ?? false;
    }
    if (_.isBoolean(opts.tracePointer)) {
      commonPreferences.ShowSingleTouches = opts.tracePointer;
      commonPreferences.ShowPinches = opts.tracePointer;
      commonPreferences.ShowPinchPivotPoint = opts.tracePointer;
      commonPreferences.HighlightEdgeGestures = opts.tracePointer;
    }
    switch (_.lowerCase(opts.pasteboardAutomaticSync)) {
      case 'on':
        commonPreferences.PasteboardAutomaticSync = true;
        break;
      case 'off':
        // Improve launching simulator performance
        // https://github.com/WebKit/webkit/blob/master/Tools/Scripts/webkitpy/xcode/simulated_device.py#L413
        commonPreferences.PasteboardAutomaticSync = false;
        break;
      case 'system':
        // Do not add -PasteboardAutomaticSync
        break;
      default:
        log.info(`['on', 'off' or 'system'] are available as the pasteboard automatic sync option. Defaulting to 'off'`);
        commonPreferences.PasteboardAutomaticSync = false;
    }
    await this.updatePreferences(opts.devicePreferences, commonPreferences);

    const timer = new timing.Timer().start();
    const shouldWaitForBoot = await startupLock.acquire(this.uiClientBundleId, async () => {
      const isServerRunning = await this.isRunning();
      const uiClientPid = await this.getUIClientPid();
      if (opts.isHeadless) {
        if (isServerRunning && !uiClientPid) {
          log.info(`Simulator with UDID '${this.udid}' is already booted in headless mode.`);
          return false;
        }
        if (await this.killUIClient({pid: uiClientPid})) {
          log.info(`Detected the Simulator UI client was running and killed it. Verifying the current Simulator state`);
        }
        try {
          // Stopping the UI client kills all running servers for some early XCode versions. This is a known bug
          await waitForCondition(async () => await this.isShutdown(), {
            waitMs: 5000,
            intervalMs: 100,
          });
        } catch (e) {
          if (!await this.isRunning()) {
            throw new Error(`Simulator with UDID '${this.udid}' cannot be transitioned to headless mode`);
          }
          return false;
        }
        log.info(`Booting Simulator with UDID '${this.udid}' in headless mode. ` +
          `All UI-related capabilities are going to be ignored`);
        await this.boot();
      } else {
        if (isServerRunning && uiClientPid) {
          log.info(`Both Simulator with UDID '${this.udid}' and the UI client are currently running`);
          return false;
        }
        if (isServerRunning) {
          log.info(`Simulator '${this.udid}' is booted while its UI is not visible. ` +
            `Trying to restart it with the Simulator window visible`);
          await this.shutdown({timeout: SIMULATOR_SHUTDOWN_TIMEOUT});
        }
        await this.launchWindow(uiClientPid, opts);
      }
      return true;
    });

    if (shouldWaitForBoot) {
      await this.waitForBoot(opts.startupTimeout);
      log.info(`Simulator with UDID ${this.udid} booted in ${timer.getDuration().asSeconds.toFixed(3)}s`);
    }

    await this.disableKeyboardIntroduction();
  }

  /**
   * Disable keyboard tutorial as 'com.apple.keyboard.preferences' domain via 'defaults' command.
   */
  async disableKeyboardIntroduction () {
    const argChunks = generateDefaultsCommandArgs({
    // To disable 'DidShowContinuousPathIntroduction' for iOS 15+ simulators since changing the preference via WDA
    // does not work on them. Lower than the versions also can have this preference, but nothing happen.
      DidShowContinuousPathIntroduction: 1
    }, true);
    await B.all(argChunks.map((args) => this.simctl.spawnProcess([
      'defaults', 'write', DOMAIN_KEYBOARD_PREFERENCES, ...args
    ])));
  }

  /***
   * Boots simulator and opens simulators UI Client if not already opened.
   *
   * @param {boolean} isUiClientRunning - process id of simulator UI client.
   * @param {RunOptions} opts - arguments to start simulator UI client with.
   */
  async launchWindow (isUiClientRunning, opts = {}) {
    await this.boot();
    if (!isUiClientRunning) {
      await this.startUIClient(opts);
    }
  }

  /**
   * Boots Simulator if not already booted.
   * Does nothing if it is already running.
   * This API does NOT wait until Simulator is fully booted.
   *
   * @throws {Error} If there was a failure while booting the Simulator.
   */
  async boot () {
    const bootEventsEmitter = new EventEmitter();
    await this.simctl.startBootMonitor({
      onError: (err) => bootEventsEmitter.emit('failure', err),
      onFinished: () => bootEventsEmitter.emit('finish'),
      shouldPreboot: true,
    });
    try {
      await new B((resolve, reject) => {
        // Historically this call was always asynchronous,
        // e.g. it was not waiting until Simulator is fully booted.
        // So we preserve that behavior, and if no errors are received for a while
        // then we assume the Simulator booting is still in progress.
        setTimeout(resolve, 3000);
        bootEventsEmitter.once('failure', (err) => {
          if (_.includes(err?.message, 'state: Booted')) {
            resolve();
          } else {
            reject(err);
          }
        });
        bootEventsEmitter.once('finish', resolve);
      });
    } finally {
      bootEventsEmitter.removeAllListeners();
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
    return await preferencesPlistGuard.acquire(SimulatorXcode9.name, async () => {
      const defaults = new NSUserDefaults(plistPath);
      const prefsToUpdate = _.clone(commonPrefs);
      try {
        if (!_.isEmpty(devicePrefs)) {
          let existingDevicePrefs;
          const udidKey = this.udid.toUpperCase();
          if (await fs.exists(plistPath)) {
            const currentPlistContent = await defaults.asJson();
            if (_.isPlainObject(currentPlistContent.DevicePreferences)
                && _.isPlainObject(currentPlistContent.DevicePreferences[udidKey])) {
              existingDevicePrefs = currentPlistContent.DevicePreferences[udidKey];
            }
          }
          Object.assign(prefsToUpdate, {
            DevicePreferences: {
              [udidKey]: Object.assign({}, existingDevicePrefs || {}, devicePrefs)
            }
          });
        }
        await defaults.update(prefsToUpdate);
        log.debug(`Updated ${this.udid} Simulator preferences at '${plistPath}' with ` +
          JSON.stringify(prefsToUpdate));
        return true;
      } catch (e) {
        log.warn(`Cannot update ${this.udid} Simulator preferences at '${plistPath}'. ` +
          `Try to delete the file manually in order to reset it. Original error: ${e.message}`);
        return false;
      }
    });
  }

  /**
   * Reset the current Simulator to the clean state.
   * @override
   */
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await this.simctl.eraseDevice(10000);
  }

  /**
   * @inheritdoc
   * @override
   * @private
   */
  async _activateWindow () {
    let selfName;
    let selfSdk;
    let bootedDevicesCount = 0;
    for (const [sdk, deviceArr] of _.toPairs(await this.simctl.getDevices())) {
      for (const {state, udid, name} of deviceArr) {
        if (state === 'Booted') {
          bootedDevicesCount++;
        }
        if (!selfName && udid === this.udid) {
          selfSdk = sdk;
          selfName = name;
        }
      }
    }
    if (bootedDevicesCount < 2) {
      return await super._activateWindow();
    }

    // There are potentially more that one Simulator window
    return `
      tell application "System Events"
        tell process "Simulator"
          set frontmost to false
          set frontmost to true
          click (menu item 1 where (its name contains "${selfName} " and its name contains "${selfSdk}")) of menu 1 of menu bar item "Window" of menu bar 1
        end tell
      end tell
    `;
  }

  /**
   * @inheritdoc
   * @override
   */
  async isBiometricEnrolled () {
    const {stdout} = await this.simctl.spawnProcess([
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
    await this.simctl.spawnProcess([
      'notifyutil',
      '-s', ENROLLMENT_NOTIFICATION_RECEIVER, isEnabled ? '1' : '0'
    ]);
    await this.simctl.spawnProcess([
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
    await this.simctl.spawnProcess([
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

  /**
   * @typedef {Object} KeyboardOptions
   * @property {!string} name The name of the keyboard locale, for example `en_US` or `de_CH`
   * @property {!string} layout The keyboard layout, for example `QUERTY` or `Ukrainian`
   * @property {?string} hardware Could either be `Automatic` or `null`
   */

  /**
   * @typedef {Object} LanguageOptions
   * @property {!string} name The name of the language, for example `de` or `zh-Hant-CN`
   */

  /**
   * @typedef {Object} LocaleOptions
   * @property {!string} name The name of the system locale, for example `de_CH` or `zh_CN`
   * @property {?string} calendar Optional calendar format, for example `gregorian` or `persian`
   */

  /**
   * @typedef {Object} LocalizationOptions
   * @property {?KeyboardOptions} keyboard
   * @property {?LanguageOptions} language
   * @property {?LocaleOptions} locale
   */

  /**
   * Change localization settings on the currently booted simulator
   *
   * @param {?LocalizationOptions} opts
   * @throws {Error} If there was a failure while setting the preferences
   * @returns {boolean} `true` if any of settings has been successfully changed
   */
  async configureLocalization (opts = {}) {
    if (_.isEmpty(opts)) {
      return false;
    }

    const { language, locale, keyboard } = opts;
    const globalPrefs = {};
    let keyboardId = null;
    if (_.isPlainObject(keyboard)) {
      const { name, layout, hardware } = keyboard;
      if (!name) {
        throw new Error(`The 'keyboard' field must have a valid name set`);
      }
      if (!layout) {
        throw new Error(`The 'keyboard' field must have a valid layout set`);
      }
      keyboardId = `${name}@sw=${layout}`;
      if (hardware) {
        keyboardId += `;@hw=${hardware}`;
      }
      globalPrefs.AppleKeyboards = [keyboardId];
    }
    if (_.isPlainObject(language)) {
      const { name } = language;
      if (!name) {
        throw new Error(`The 'language' field must have a valid name set`);
      }
      globalPrefs.AppleLanguages = [name];
    }
    if (_.isPlainObject(locale)) {
      const { name, calendar } = locale;
      if (!name) {
        throw new Error(`The 'locale' field must have a valid name set`);
      }
      let localeId = name;
      if (calendar) {
        localeId += `@calendar=${calendar}`;
      }
      globalPrefs.AppleLocale = localeId;
    }
    if (_.isEmpty(globalPrefs)) {
      return false;
    }

    const argChunks = generateDefaultsCommandArgs(globalPrefs, true);
    await B.all(argChunks.map((args) => this.simctl.spawnProcess([
      'defaults', 'write', '.GlobalPreferences.plist', ...args
    ])));

    if (keyboardId) {
      const argChunks = generateDefaultsCommandArgs({
        KeyboardsCurrentAndNext: [keyboardId],
        KeyboardLastUsed: keyboardId,
        KeyboardLastUsedForLanguage: { [keyboard.name]: keyboardId }
      }, true);
      await B.all(argChunks.map((args) => this.simctl.spawnProcess([
        'defaults', 'write', 'com.apple.Preferences', ...args
      ])));
    }

    return true;
  }

}

export default SimulatorXcode9;
