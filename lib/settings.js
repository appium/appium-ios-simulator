import _ from 'lodash';
import { plist } from '@appium/support';
import path from 'path';
import log from './logger';
import semver from 'semver';
import B from 'bluebird';

const PLIST_IDENTIFIER = Object.freeze({
  WEB_INSPECTOR: 'webInspector',
  MOBILE_SAFARI: 'mobileSafari',
  GLOBAL_MOBILE_SAFARI: 'globalMobileSafari',
  WEB_UI: 'webUI',
  WEB_FOUNDATION: 'webFoundation',
  PREFERENCES: 'preferences',
  GLOBAL_PREFERENCES: 'globalPreferences',
  LOCATION_SERVICES: 'locationServices',
  LOCATION_CLIENTS: 'locationClients',
  LOCATION_CACHE: 'locationCache',
  USER_SETTINGS: 'userSettings',
  EFFECTIVE_USER_SETTINGS: 'effectiveUserSettings',
  ACCESSIBLITY_SETTINGS: 'accessibilitySettings',
  UI_STYLE_SETTINGS: 'uiStyleSettings',
});

/**
 * Retrieves the list of matching directory paths for the given identifier
 *
 * @param {object} sim Simulator instance
 * @param {string} identifier One of supported path identifiers
 * @returns {string[]} The list of matched paths
 */
async function plistPaths (sim, identifier) {
  const simDirectory = sim.getDir();

  switch (identifier) {
    case PLIST_IDENTIFIER.WEB_INSPECTOR:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.webInspector.plist')];
    case PLIST_IDENTIFIER.MOBILE_SAFARI:
      return [
        path.resolve(await sim.getAppDir('com.apple.mobilesafari'), 'Library', 'Preferences', 'com.apple.mobilesafari.plist')
      ];
    case PLIST_IDENTIFIER.GLOBAL_MOBILE_SAFARI:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.mobilesafari.plist')];
    case PLIST_IDENTIFIER.WEB_UI:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.WebUI.plist')];
    case PLIST_IDENTIFIER.WEB_FOUNDATION:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.WebFoundation.plist')];
    case PLIST_IDENTIFIER.PREFERENCES:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.Preferences.plist')];
    case PLIST_IDENTIFIER.GLOBAL_PREFERENCES:
      return [path.resolve(simDirectory, 'Library', 'Preferences', '.GlobalPreferences.plist')];
    case PLIST_IDENTIFIER.LOCATION_SERVICES:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.locationd.plist')];
    case PLIST_IDENTIFIER.LOCATION_CLIENTS:
      return [path.resolve(simDirectory, 'Library', 'Caches', 'locationd', 'clients.plist')];
    case PLIST_IDENTIFIER.LOCATION_CACHE:
      return [
        ['Caches', 'locationd', 'cache.plist'],
        ['Preferences', 'com.apple.locationd.plist']
      ].map((x) => path.resolve(simDirectory, 'Library', ...x));
    case PLIST_IDENTIFIER.USER_SETTINGS: {
      const profilesDirName = semver.lt(semver.coerce(sim.xcodeVersion.versionString), semver.coerce('7.3'))
        ? 'ConfigurationProfiles'
        : 'UserConfigurationProfiles';
      return [
        ['UserSettings.plist'],
        ['EffectiveUserSettings.plist'],
        ['PublicInfo', 'PublicEffectiveUserSettings.plist'],
      ].map((x) => path.resolve(simDirectory, 'Library', profilesDirName, ...x));
    }
    case PLIST_IDENTIFIER.EFFECTIVE_USER_SETTINGS:
      return [
        ['EffectiveUserSettings.plist'],
        ['PublicInfo', 'PublicEffectiveUserSettings.plist']
      ].map((x) => path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', ...x));
    case PLIST_IDENTIFIER.ACCESSIBLITY_SETTINGS:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.Accessibility.plist')];
    case PLIST_IDENTIFIER.UI_STYLE_SETTINGS:
      return [path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.uikitservices.userInterfaceStyleMode.plist')];
    default:
      return [];
  }
}

/**
 * Updates plist files with the given PLIST_IDENTIFIER
 *
 * @param {object} sim Simulator instance
 * @param {string} plist One of PLIST_IDENTIFIER constants
 * @param {object} updates Plist updates to apply
 * @returns {boolean} True if at least one .plist file has been changed
 */
async function updateSettings (sim, plist, updates) {
  const paths = await plistPaths(sim, plist);
  if (_.isEmpty(paths)) {
    return false;
  }
  const results = await B.all(paths.map((p) => update(p, updates)));
  return _.some(results, Boolean);
}

/**
 * Update a plist file, located at pathToPlist
 * pass in an object, all settings specified in the object will be
 * updated on the plist, all others left as-is
 *
 * @param {string} pathToPlist The full path to .plist file
 * @param {object} updates Actual updates object to apply
 * @returns {boolean} True if updates were applied and changed the actual plist
 */
async function update (pathToPlist, updates) {
  const currentSettings = await read(pathToPlist);
  const newSettings = Object.assign({}, currentSettings, updates);

  if (_.isEqual(currentSettings, newSettings)) {
    // no setting changes, so do nothing
    return false;
  }

  await plist.updatePlistFile(pathToPlist, newSettings, true, false);
  return true;
}

/**
 * Retrieves data from the given .plist files
 *
 * @param {object} sim Simulator instance
 * @param {string} plist One of PLIST_IDENTIFIER constants
 * @returns {object} Mapping where keys are file paths and values are their contents
 */
async function readSettings (sim, plist) {
  const paths = await plistPaths(sim, plist);
  if (_.isEmpty(paths)) {
    return {};
  }
  const settings = await B.all(paths.map(read));
  return _.fromPairs(_.zip(paths, settings));
}

/**
 * Retrieves data from the given .plist file
 *
 * @param {string} pathToPlist Full path to a .splist file
 * @returns {*} Plist content
 */
async function read (pathToPlist) {
  return await plist.parsePlistFile(pathToPlist, false);
}

async function updateLocationSettings (sim, bundleId, authorized) {
  // update location cache
  const newCachePrefs = {
    LastFenceActivityTimestamp: 412122103.232983,
    CleanShutdown: true
  };
  const updated = await updateSettings(sim, PLIST_IDENTIFIER.LOCATION_CACHE, {
    [bundleId]: newCachePrefs
  });

  // update location clients
  const newClientPrefs = {
    BundleId: bundleId,
    Authorized: !!authorized,
    Whitelisted: false,
  };

  const paths = await plistPaths(sim, PLIST_IDENTIFIER.LOCATION_CLIENTS);
  if (_.isEmpty(paths)) {
    return false;
  }
  const contents = await B.all(paths.map(read));
  const promises = [];
  for (const [file, content] of _.zip(paths, contents)) {
    log.debug(`Updating location client file: ${file}`);

    const updates = {};
    // random data that always seems to be in the clients.plist
    const weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
                        'PrivateFrameworks/AOSNotification.framework';
    if (!_.has(content, weirdLocKey)) {
      updates[weirdLocKey] = {
        BundlePath: '/System/Library/PrivateFrameworks/AOSNotification.framework',
        Whitelisted: false,
        Executable: '',
        Registered: ''
      };
    }
    // create the update, and make sure it has sensible values
    const baseSetting = _.has(content, bundleId) ? content[bundleId] : {};
    updates[bundleId] = _.defaults(newClientPrefs, baseSetting);
    updates[bundleId].Executable = updates[bundleId].Executable || '';
    updates[bundleId].Registered = updates[bundleId].Registered || '';

    promises.push(update(file, updates));
  }
  return (_.isEmpty(promises) ? false : _.some(await B.all(promises), Boolean)) || updated;
}

async function setReduceMotion (sim, reduceMotion = true) {
  log.debug(`Updating reduce motion. Setting to ${reduceMotion}.`);
  await updateSettings(sim, PLIST_IDENTIFIER.ACCESSIBLITY_SETTINGS, {
    ReduceMotionEnabled: reduceMotion ? 1 : 0
  });
}

async function setReduceTransparency (sim, reduceTransparency) {
  log.debug(`Updating reduce tranceparency. Setting to ${reduceTransparency}.`);
  await updateSettings(sim, PLIST_IDENTIFIER.ACCESSIBLITY_SETTINGS, {
    EnhancedBackgroundContrastEnabled: reduceTransparency ? 1 : 0
  });
}

async function updateSafariGlobalSettings (sim, settingSet) {
  log.debug('Updating Safari global settings');

  const promises = [];
  for (const [file, safariSettingSet] of _.toPairs(await readSettings(sim, PLIST_IDENTIFIER.GLOBAL_MOBILE_SAFARI))) {
    const newSettings = {};
    for (const [key, value] of _.toPairs(settingSet)) {
      if (safariSettingSet[key] !== value) {
        newSettings[key] = value;
      }
    }
    if (_.isEmpty(newSettings)) {
      continue;
    }
    promises.push(update(file, newSettings));
  }
  return _.isEmpty(promises) ? false : _.some(await B.all(promises), Boolean);
}

async function updateSafariUserSettings (sim, settingSet) {
  log.debug('Updating Safari user settings');

  // add extra stuff to UserSettings.plist and EffectiveUserSettings.plist
  const newUserSettings = {};
  if (_.has(settingSet, 'WebKitJavaScriptEnabled')) {
    newUserSettings.safariAllowJavaScript = settingSet.WebKitJavaScriptEnabled;
  }
  if (_.has(settingSet, 'WebKitJavaScriptCanOpenWindowsAutomatically')) {
    newUserSettings.safariAllowPopups = settingSet.WebKitJavaScriptCanOpenWindowsAutomatically;
  }
  if (_.has(settingSet, 'WarnAboutFraudulentWebsites')) {
    newUserSettings.safariForceFraudWarning = !settingSet.WarnAboutFraudulentWebsites;
  }
  if (_.isEmpty(newUserSettings)) {
    return false;
  }

  const promises = [];
  for (const [file, userSettingSet] of _.toPairs(await readSettings(sim, PLIST_IDENTIFIER.USER_SETTINGS))) {
    // the user settings plist has two buckets, one for
    // boolean settings (`restrictedBool`) and one for
    // other value settings (`restrictedValue`). In each, the value
    // is in a `value` sub-field.
    if (!_.has(userSettingSet, 'restrictedBool')) {
      userSettingSet.restrictedBool = {};
    }
    for (const [key, value] of _.toPairs(newUserSettings)) {
      userSettingSet.restrictedBool[key] = {value};
    }

    promises.push(update(file, userSettingSet));
  }
  return _.isEmpty(promises) ? false : _.some(await B.all(promises), Boolean);
}

async function updateLocale (sim, language, locale, calendarFormat) {
  const globalPrefs = (await plistPaths(sim, PLIST_IDENTIFIER.GLOBAL_PREFERENCES))[0];
  if (!globalPrefs) {
    throw new Error('Global preferences folder path cannot be retrieved');
  }

  // get the current data
  let data = await read(globalPrefs);
  let updates = {};

  // if we are setting the language, add it to the beginning of the list of languages
  if (language) {
    log.debug(`New language: ${language}`);
    let supportedLangs = data.AppleLanguages || [];
    // if the language is first, we don't need to do anything
    if (supportedLangs.indexOf(language) !== 0) {
      updates.AppleLanguages = [language].concat(_.without(supportedLangs, language));
    }
  }
  // if we are setting the locale or calendar format, set them as appropriate
  if (locale || calendarFormat) {
    let calSplit = '@calendar=';
    let curLocaleAndCal = data.AppleLocale || language || 'en';

    let split = curLocaleAndCal.split(calSplit);
    let curLoc = split[0];
    if (calendarFormat || split[1]) {
      calendarFormat = `${calSplit}${calendarFormat || split[1] || ''}`;
    }
    calendarFormat = calendarFormat || '';
    let newLocaleAndCal = locale ? locale : curLoc;
    if (calendarFormat) {
      newLocaleAndCal = `${newLocaleAndCal}${calendarFormat}`;
    }
    // only need to update if it has changed
    if (newLocaleAndCal !== curLocaleAndCal) {
      log.debug(`New locale: ${newLocaleAndCal}`);
      updates.AppleLocale = newLocaleAndCal;
    }
  }

  if (_.size(updates) === 0) {
    log.debug('No locale updates necessary.');
    return false;
  }

  log.debug('Writing new locale plist data');
  await update(globalPrefs, updates);
  return true;
}

export {
  update, updateSettings, updateLocationSettings, setReduceMotion, setReduceTransparency,
  updateSafariUserSettings, updateSafariGlobalSettings, updateLocale, read,
  readSettings, PLIST_IDENTIFIER
};
