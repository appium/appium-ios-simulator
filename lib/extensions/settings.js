/* eslint-disable @typescript-eslint/no-unused-vars */
import _ from 'lodash';
import { NSUserDefaults, generateDefaultsCommandArgs } from '../defaults-utils';
import B from 'bluebird';
import path from 'path';
import { exec } from 'teen_process';
import AsyncLock from 'async-lock';
import { fs } from '@appium/support';

// com.apple.SpringBoard: translates com.apple.SpringBoard and system prompts for push notification
// com.apple.locationd: translates system prompts for location
// com.apple.tccd: translates system prompts for camera, microphone, contact, photos and app tracking transparency
// com.apple.akd: translates `Sign in with your Apple ID` system prompt
const SERVICES_FOR_TRANSLATION = ['com.apple.SpringBoard', 'com.apple.locationd', 'com.apple.tccd', 'com.apple.akd'];
const GLOBAL_PREFS_PLIST = '.GlobalPreferences.plist';
const PREFERENCES_PLIST_GUARD = new AsyncLock();
const DOMAIN = /** @type {const} */ Object.freeze({
  KEYBOARD: 'com.apple.keyboard.preferences',
  ACCESSIBILITY: 'com.apple.Accessibility',
});

/**
 * Updates Reduce Motion setting state.
 *
 * @this {CoreSimulatorWithSettings}
 * @param {boolean} reduceMotion Whether to enable or disable the setting.
 */
export async function setReduceMotion (reduceMotion) {
  return await this.updateSettings(DOMAIN.ACCESSIBILITY, {
    ReduceMotionEnabled: Number(reduceMotion)
  });
}

/**
 * Updates Reduce Transparency setting state.
 *
 * @this {CoreSimulatorWithSettings}
 * @param {boolean} reduceTransparency Whether to enable or disable the setting.
 */
export async function setReduceTransparency (reduceTransparency) {
  return await this.updateSettings(DOMAIN.ACCESSIBILITY, {
    EnhancedBackgroundContrastEnabled: Number(reduceTransparency)
  });
}

/**
 * Disable keyboard tutorial as 'com.apple.keyboard.preferences' domain via 'defaults' command.
 * @this {CoreSimulatorWithSettings}
 * @returns {Promise<boolean>}
 */
export async function disableKeyboardIntroduction () {
  return await this.updateSettings(DOMAIN.KEYBOARD, {
    // To disable 'DidShowContinuousPathIntroduction' for iOS 15+ simulators since changing the preference via WDA
    // does not work on them. Lower than the versions also can have this preference, but nothing happen.
    DidShowContinuousPathIntroduction: 1
  });
}

/**
 * Allows to update Simulator preferences in runtime.
 *
 * @this {CoreSimulatorWithSettings}
 * @param {string} domain The name of preferences domain to be updated,
 * for example, 'com.apple.Preferences' or 'com.apple.Accessibility' or
 * full path to a plist file on the local file system.
 * @param {import('@appium/types').StringRecord} updates Mapping of keys/values to be updated
 * @returns {Promise<boolean>} True if settings were actually changed
 */
export async function updateSettings (domain, updates) {
  if (_.isEmpty(updates)) {
    return false;
  }

  const argChunks = generateDefaultsCommandArgs(updates);
  await B.all(argChunks.map((args) => this.simctl.spawnProcess([
    'defaults', 'write', domain, ...args
  ])));
  return true;
}

/**
 * Sets UI appearance style.
 * This function can only be called on a booted simulator.
 *
 * @this {CoreSimulatorWithSettings}
 * @param {string} value
 * @since Xcode SDK 11.4
 * @returns {Promise<void>}
 */
export async function setAppearance (value) { // eslint-disable-line require-await
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to set UI appearance`);
}

/**
 * Gets the current UI appearance style
 * This function can only be called on a booted simulator.
 *
 * @this {CoreSimulatorWithSettings}
 * @returns {Promise<string>}
 * @since Xcode SDK 11.4
 */
export async function getAppearance () { // eslint-disable-line require-await
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to get UI appearance`);
}

/**
 * Change localization settings on the currently booted simulator
 *
 * @this {CoreSimulatorWithSettings}
 * @param {import('../types').LocalizationOptions} [opts={}]
 * @throws {Error} If there was a failure while setting the preferences
 * @returns {Promise<boolean>} `true` if any of settings has been successfully changed
 */
export async function configureLocalization (opts = {}) {
  if (_.isEmpty(opts)) {
    return false;
  }

  const { language, locale, keyboard } = opts;
  const globalPrefs = {};
  let keyboardId = null;
  if (_.isPlainObject(keyboard)) {
    // @ts-ignore The above check ensures keyboard is what it should be
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
    // @ts-ignore The above check ensures language is what it should be
    const { name } = language;
    if (!name) {
      throw new Error(`The 'language' field must have a valid name set`);
    }
    globalPrefs.AppleLanguages = [name];
  }
  if (_.isPlainObject(locale)) {
    // @ts-ignore The above check ensures locale is what it should be
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

  let previousAppleLanguages = null;
  if (globalPrefs.AppleLanguages) {
    const absolutePrefsPath = path.join(this.getDir(), 'Library', 'Preferences', GLOBAL_PREFS_PLIST);
    try {
      const {stdout} = await exec('plutil', ['-convert', 'json', absolutePrefsPath, '-o', '-']);
      previousAppleLanguages = JSON.parse(stdout).AppleLanguages;
    } catch (e) {
      this.log.debug(`Cannot retrieve the current value of the 'AppleLanguages' preference: ${e.message}`);
    }
  }

  const argChunks = generateDefaultsCommandArgs(globalPrefs, true);
  await B.all(argChunks.map((args) => this.simctl.spawnProcess([
    'defaults', 'write', GLOBAL_PREFS_PLIST, ...args
  ])));

  if (keyboard && keyboardId) {
    const argChunks = generateDefaultsCommandArgs({
      KeyboardsCurrentAndNext: [keyboardId],
      KeyboardLastUsed: keyboardId,
      KeyboardLastUsedForLanguage: { [keyboard.name]: keyboardId }
    }, true);
    await B.all(argChunks.map((args) => this.simctl.spawnProcess([
      'defaults', 'write', 'com.apple.Preferences', ...args
    ])));
  }

  if (globalPrefs.AppleLanguages) {
    if (_.isEqual(previousAppleLanguages, globalPrefs.AppleLanguages)) {
      this.log.info(
        `The 'AppleLanguages' preference is already set to '${globalPrefs.AppleLanguages}'. ` +
        `Skipping services reset`
      );
    } else if (language?.skipSyncUiDialogTranslation) {
      this.log.info('Skipping services reset as requested. This might leave some system UI alerts untranslated');
    } else {
      this.log.info(
        `Will restart the following services in order to sync UI dialogs translation: ` +
        `${SERVICES_FOR_TRANSLATION}. This might have unexpected side effects, ` +
        `see https://github.com/appium/appium/issues/19440 for more details`
      );
      await B.all(SERVICES_FOR_TRANSLATION.map((arg) => this.simctl.spawnProcess([
        'launchctl', 'stop', arg
      ])));
    }
  }

  return true;
}

/**
 * Updates Auto Fill Passwords setting state.
 *
 * @this {CoreSimulatorWithSettings}
 * @param {boolean} isEnabled Whether to enable or disable the setting.
 * @returns {Promise<boolean>}
 */
export async function setAutoFillPasswords (isEnabled) {
  return await this.updateSettings('com.apple.WebUI', {
    AutoFillPasswords: Number(isEnabled)
  });
}

/**
 * Update the common iOS Simulator preferences file with new values.
 * It is necessary to restart the corresponding Simulator before
 * these changes are applied.
 *
 * @private
 * @this {CoreSimulatorWithSettings}
 * @param {import('../types').DevicePreferences} [devicePrefs={}] - The mapping, which represents new device preference values
 * for the given Simulator.
 * @param {import('../types').CommonPreferences} [commonPrefs={}] - The mapping, which represents new common preference values
 * for all Simulators.
 * @return {Promise<boolean>} True if the preferences were successfully updated.
 */
export async function updatePreferences (devicePrefs = {}, commonPrefs = {}) {
  if (!_.isEmpty(devicePrefs)) {
    this.log.debug(`Setting preferences of ${this.udid} Simulator to ${JSON.stringify(devicePrefs)}`);
  }
  if (!_.isEmpty(commonPrefs)) {
    this.log.debug(`Setting common Simulator preferences to ${JSON.stringify(commonPrefs)}`);
  }
  const homeFolderPath = process.env.HOME;
  if (!homeFolderPath) {
    this.log.warn(`Cannot get the path to HOME folder from the process environment. ` +
      `Ignoring Simulator preferences update.`);
    return false;
  }
  verifyDevicePreferences.bind(this)(devicePrefs);
  const plistPath = path.resolve(homeFolderPath, 'Library', 'Preferences', 'com.apple.iphonesimulator.plist');
  return await PREFERENCES_PLIST_GUARD.acquire(this.constructor.name, async () => {
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
      this.log.debug(`Updated ${this.udid} Simulator preferences at '${plistPath}' with ` +
        JSON.stringify(prefsToUpdate));
      return true;
    } catch (e) {
      this.log.warn(`Cannot update ${this.udid} Simulator preferences at '${plistPath}'. ` +
        `Try to delete the file manually in order to reset it. Original error: ${e.message}`);
      return false;
    }
  });
}

/**
 * Creates device and common Simulator preferences, which could
 * be later applied using `defaults` CLI utility.
 *
 * @this {CoreSimulatorWithSettings}
 * @private
 * @param {import('../types').RunOptions} [opts={}]
 * @returns {any[]} The first array item is the resulting device preferences
 * object and the second one is common preferences object
 */
export function compileSimulatorPreferences (opts = {}) {
  const {
    connectHardwareKeyboard,
    tracePointer,
    pasteboardAutomaticSync,
    scaleFactor,
  } = opts;
  const commonPreferences = {
    // This option is necessary to make the Simulator window follow
    // the actual XCUIDevice orientation
    RotateWindowWhenSignaledByGuest: true,
    // https://github.com/appium/appium/issues/16418
    StartLastDeviceOnLaunch: false,
    DetachOnWindowClose: false,
    AttachBootedOnStart: true,
  };
  const devicePreferences = opts.devicePreferences ? _.cloneDeep(opts.devicePreferences) : {};
  if (scaleFactor) {
    devicePreferences.SimulatorWindowLastScale = parseFloat(scaleFactor);
  }
  if (_.isBoolean(connectHardwareKeyboard) || _.isNil(connectHardwareKeyboard)) {
    devicePreferences.ConnectHardwareKeyboard = connectHardwareKeyboard ?? false;
    commonPreferences.ConnectHardwareKeyboard = connectHardwareKeyboard ?? false;
  }
  if (_.isBoolean(tracePointer)) {
    commonPreferences.ShowSingleTouches = tracePointer;
    commonPreferences.ShowPinches = tracePointer;
    commonPreferences.ShowPinchPivotPoint = tracePointer;
    commonPreferences.HighlightEdgeGestures = tracePointer;
  }
  switch (_.lowerCase(pasteboardAutomaticSync)) {
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
      this.log.info(`['on', 'off' or 'system'] are available as the pasteboard automatic sync option. Defaulting to 'off'`);
      commonPreferences.PasteboardAutomaticSync = false;
  }
  return [devicePreferences, commonPreferences];
}

/**
 * Perform verification of device preferences correctness.
 *
 * @private
 * @this {CoreSimulatorWithSettings}
 * @param {import('../types').DevicePreferences} [prefs={}] - The preferences to be verified
 * @returns {void}
 * @throws {Error} If any of the given preference values does not match the expected
 * format.
 */
export function verifyDevicePreferences (prefs = {}) {
  if (_.isEmpty(prefs)) {
    return;
  }

  if (!_.isUndefined(prefs.SimulatorWindowLastScale)) {
    if (!_.isNumber(prefs.SimulatorWindowLastScale) || prefs.SimulatorWindowLastScale <= 0) {
      this.log.errorAndThrow(`SimulatorWindowLastScale is expected to be a positive float value. ` +
        `'${prefs.SimulatorWindowLastScale}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowCenter)) {
    // https://regex101.com/r/2ZXOij/2
    const verificationPattern = /{-?\d+(\.\d+)?,-?\d+(\.\d+)?}/;
    if (!_.isString(prefs.SimulatorWindowCenter) || !verificationPattern.test(prefs.SimulatorWindowCenter)) {
      this.log.errorAndThrow(`SimulatorWindowCenter is expected to match "{floatXPosition,floatYPosition}" format (without spaces). ` +
        `'${prefs.SimulatorWindowCenter}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowOrientation)) {
    const acceptableValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
    if (!prefs.SimulatorWindowOrientation || !acceptableValues.includes(prefs.SimulatorWindowOrientation)) {
      this.log.errorAndThrow(`SimulatorWindowOrientation is expected to be one of ${acceptableValues}. ` +
        `'${prefs.SimulatorWindowOrientation}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowRotationAngle)) {
    if (!_.isNumber(prefs.SimulatorWindowRotationAngle)) {
      this.log.errorAndThrow(`SimulatorWindowRotationAngle is expected to be a valid number. ` +
        `'${prefs.SimulatorWindowRotationAngle}' is assigned instead.`);
    }
  }
}

/**
 * @typedef {import('../types').CoreSimulator & import('../types').HasSettings} CoreSimulatorWithSettings
 */
