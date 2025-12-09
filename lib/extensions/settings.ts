import _ from 'lodash';
import { NSUserDefaults, generateDefaultsCommandArgs } from '../defaults-utils';
import B from 'bluebird';
import path from 'path';
import { exec } from 'teen_process';
import AsyncLock from 'async-lock';
import { fs } from '@appium/support';
import type { CoreSimulator, HasSettings, DevicePreferences, CommonPreferences, RunOptions, LocalizationOptions } from '../types';
import type { StringRecord } from '@appium/types';

type CoreSimulatorWithSettings = CoreSimulator & HasSettings;

// com.apple.SpringBoard: translates com.apple.SpringBoard and system prompts for push notification
// com.apple.locationd: translates system prompts for location
// com.apple.tccd: translates system prompts for camera, microphone, contact, photos and app tracking transparency
// com.apple.akd: translates `Sign in with your Apple ID` system prompt
const SERVICES_FOR_TRANSLATION = ['com.apple.SpringBoard', 'com.apple.locationd', 'com.apple.tccd', 'com.apple.akd'] as const;
const GLOBAL_PREFS_PLIST = '.GlobalPreferences.plist';
const PREFERENCES_PLIST_GUARD = new AsyncLock();
const DOMAIN = Object.freeze({
  KEYBOARD: 'com.apple.keyboard.preferences',
  ACCESSIBILITY: 'com.apple.Accessibility',
} as const);

/**
 * Updates Reduce Motion setting state.
 *
 * @param reduceMotion Whether to enable or disable the setting.
 */
export async function setReduceMotion(this: CoreSimulatorWithSettings, reduceMotion: boolean): Promise<boolean> {
  return await this.updateSettings(DOMAIN.ACCESSIBILITY, {
    ReduceMotionEnabled: Number(reduceMotion)
  });
}

/**
 * Updates Reduce Transparency setting state.
 *
 * @param reduceTransparency Whether to enable or disable the setting.
 */
export async function setReduceTransparency(
  this: CoreSimulatorWithSettings,
  reduceTransparency: boolean
): Promise<boolean> {
  return await this.updateSettings(DOMAIN.ACCESSIBILITY, {
    EnhancedBackgroundContrastEnabled: Number(reduceTransparency)
  });
}

/**
 * Disable keyboard tutorial as 'com.apple.keyboard.preferences' domain via 'defaults' command.
 * @returns Promise that resolves to true if settings were updated
 */
export async function disableKeyboardIntroduction(this: CoreSimulatorWithSettings): Promise<boolean> {
  return await this.updateSettings(DOMAIN.KEYBOARD, {
    // To disable 'DidShowContinuousPathIntroduction' for iOS 15+ simulators since changing the preference via WDA
    // does not work on them. Lower than the versions also can have this preference, but nothing happen.
    DidShowContinuousPathIntroduction: 1
  });
}

/**
 * Allows to update Simulator preferences in runtime.
 *
 * @param domain The name of preferences domain to be updated,
 * for example, 'com.apple.Preferences' or 'com.apple.Accessibility' or
 * full path to a plist file on the local file system.
 * @param updates Mapping of keys/values to be updated
 * @returns True if settings were actually changed
 */
export async function updateSettings(
  this: CoreSimulatorWithSettings,
  domain: string,
  updates: StringRecord
): Promise<boolean> {
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
 * @param value one of possible appearance values:
 * - dark: to switch to the Dark mode
 * - light: to switch to the Light mode
 * @since Xcode SDK 11.4
 */
export async function setAppearance(this: CoreSimulatorWithSettings, value: string): Promise<void> {
  await this.simctl.setAppearance(_.toLower(value));
}

/**
 * Gets the current UI appearance style
 * This function can only be called on a booted simulator.
 *
 * @returns the current UI appearance style.
 * Possible values are:
 * - dark: to switch to the Dark mode
 * - light: to switch to the Light mode
 * @since Xcode SDK 11.4
 */
export async function getAppearance(this: CoreSimulatorWithSettings): Promise<string> {
  return await this.simctl.getAppearance();
}

/**
 * Sets the increase contrast configuration for the given simulator.
 * This function can only be called on a booted simulator.
 *
 * @param _value valid increase contrast configuration value.
 *                       Acceptable value is 'enabled' or 'disabled' with Xcode 16.2.
 * @since Xcode SDK 15 (but lower xcode could have this command)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setIncreaseContrast(this: CoreSimulatorWithSettings, _value: string): Promise<void> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to set content size`);
}

/**
 * Retrieves the current increase contrast configuration value from the given simulator.
 * This function can only be called on a booted simulator.
 *
 * @returns the contrast configuration value.
 *                            Possible return value is 'enabled', 'disabled',
 *                            'unsupported' or 'unknown' with Xcode 16.2.
 * @since Xcode SDK 15 (but lower xcode could have this command)
 */
export async function getIncreaseContrast(this: CoreSimulatorWithSettings): Promise<string> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to get content size`);
}

/**
 * Sets content size for the given simulator.
 * This function can only be called on a booted simulator.
 *
 * @param _value valid content size or action value. Acceptable value is
 *                       extra-small, small, medium, large, extra-large, extra-extra-large,
 *                       extra-extra-extra-large, accessibility-medium, accessibility-large,
 *                       accessibility-extra-large, accessibility-extra-extra-large,
 *                       accessibility-extra-extra-extra-large with Xcode 16.2.
 * @since Xcode SDK 15 (but lower xcode could have this command)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setContentSize(this: CoreSimulatorWithSettings, _value: string): Promise<void> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to set content size`);
}

/**
 * Retrieves the current content size value from the given simulator.
 * This function can only be called on a booted simulator.
 *
 * @return the content size value. Possible return value is
 *                           extra-small, small, medium, large, extra-large, extra-extra-large,
 *                           extra-extra-extra-large, accessibility-medium, accessibility-large,
 *                           accessibility-extra-large, accessibility-extra-extra-large,
 *                           accessibility-extra-extra-extra-large,
 *                           unknown or unsupported with Xcode 16.2.
 * @since Xcode SDK 15 (but lower xcode could have this command)
 */
export async function getContentSize(this: CoreSimulatorWithSettings): Promise<string> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to get content size`);
}

/**
 * Change localization settings on the currently booted simulator
 *
 * @param opts Localization options
 * @throws {Error} If there was a failure while setting the preferences
 * @returns `true` if any of settings has been successfully changed
 */
export async function configureLocalization(
  this: CoreSimulatorWithSettings,
  opts: LocalizationOptions = {}
): Promise<boolean> {
  if (_.isEmpty(opts)) {
    return false;
  }

  const { language, locale, keyboard } = opts;
  const globalPrefs: Record<string, any> = {};
  let keyboardId: string | null = null;
  if (_.isPlainObject(keyboard) && keyboard) {
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
  if (_.isPlainObject(language) && language) {
    const { name } = language;
    if (!name) {
      throw new Error(`The 'language' field must have a valid name set`);
    }
    globalPrefs.AppleLanguages = [name];
  }
  if (_.isPlainObject(locale) && locale) {
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

  let previousAppleLanguages: any = null;
  if (globalPrefs.AppleLanguages) {
    const absolutePrefsPath = path.join(this.getDir(), 'Library', 'Preferences', GLOBAL_PREFS_PLIST);
    try {
      const {stdout} = await exec('plutil', ['-convert', 'json', absolutePrefsPath, '-o', '-']);
      previousAppleLanguages = JSON.parse(stdout).AppleLanguages;
    } catch (e: any) {
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
 * @param isEnabled Whether to enable or disable the setting.
 * @returns Promise that resolves to true if settings were updated
 */
export async function setAutoFillPasswords(this: CoreSimulatorWithSettings, isEnabled: boolean): Promise<boolean> {
  return await this.updateSettings('com.apple.WebUI', {
    AutoFillPasswords: Number(isEnabled)
  });
}

/**
 * Update the common iOS Simulator preferences file with new values.
 * It is necessary to restart the corresponding Simulator before
 * these changes are applied.
 *
 * @param devicePrefs The mapping, which represents new device preference values
 * for the given Simulator.
 * @param commonPrefs The mapping, which represents new common preference values
 * for all Simulators.
 * @return True if the preferences were successfully updated.
 */
export async function updatePreferences(
  this: CoreSimulatorWithSettings,
  devicePrefs: DevicePreferences = {},
  commonPrefs: CommonPreferences = {}
): Promise<boolean> {
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
        let existingDevicePrefs: any;
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
    } catch (e: any) {
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
 * @param opts Run options
 * @returns The first array item is the resulting device preferences
 * object and the second one is common preferences object
 */
export function compileSimulatorPreferences(
  this: CoreSimulatorWithSettings,
  opts: RunOptions = {}
): [DevicePreferences, CommonPreferences & Record<string, any>] {
  const {
    connectHardwareKeyboard,
    tracePointer,
    pasteboardAutomaticSync,
    scaleFactor,
  } = opts;
  const commonPreferences: CommonPreferences & Record<string, any> = {
    // This option is necessary to make the Simulator window follow
    // the actual XCUIDevice orientation
    RotateWindowWhenSignaledByGuest: true,
    // https://github.com/appium/appium/issues/16418
    StartLastDeviceOnLaunch: false,
    DetachOnWindowClose: false,
    AttachBootedOnStart: true,
  };
  const devicePreferences: DevicePreferences = opts.devicePreferences ? _.cloneDeep(opts.devicePreferences) : {};
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
  switch (_.lowerCase(pasteboardAutomaticSync || '')) {
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
 * @param prefs The preferences to be verified
 * @returns void
 * @throws {Error} If any of the given preference values does not match the expected
 * format.
 */
export function verifyDevicePreferences(this: CoreSimulatorWithSettings, prefs: DevicePreferences = {}): void {
  if (_.isEmpty(prefs)) {
    return;
  }

  if (!_.isUndefined(prefs.SimulatorWindowLastScale)) {
    if (!_.isNumber(prefs.SimulatorWindowLastScale) || prefs.SimulatorWindowLastScale <= 0) {
      throw this.log.errorWithException(`SimulatorWindowLastScale is expected to be a positive float value. ` +
        `'${prefs.SimulatorWindowLastScale}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowCenter)) {
    // https://regex101.com/r/2ZXOij/2
    const verificationPattern = /{-?\d+(\.\d+)?,-?\d+(\.\d+)?}/;
    if (!_.isString(prefs.SimulatorWindowCenter) || !verificationPattern.test(prefs.SimulatorWindowCenter)) {
      throw this.log.errorWithException(`SimulatorWindowCenter is expected to match "{floatXPosition,floatYPosition}" format (without spaces). ` +
        `'${prefs.SimulatorWindowCenter}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowOrientation)) {
    const acceptableValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
    if (!prefs.SimulatorWindowOrientation || !acceptableValues.includes(prefs.SimulatorWindowOrientation)) {
      throw this.log.errorWithException(`SimulatorWindowOrientation is expected to be one of ${acceptableValues}. ` +
        `'${prefs.SimulatorWindowOrientation}' is assigned instead.`);
    }
  }

  if (!_.isUndefined(prefs.SimulatorWindowRotationAngle)) {
    if (!_.isNumber(prefs.SimulatorWindowRotationAngle)) {
      throw this.log.errorWithException(`SimulatorWindowRotationAngle is expected to be a valid number. ` +
        `'${prefs.SimulatorWindowRotationAngle}' is assigned instead.`);
    }
  }
}

