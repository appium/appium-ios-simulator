import _ from 'lodash';
import { plist } from 'appium-support';
import path from 'path';
import log from './logger';
import semver from 'semver';
import B from 'bluebird';


// returns path to plist based on id for plist.
// these ids are appium terms
async function plistPaths (sim, identifier) {
  let paths = [];
  let simDirectory = sim.getDir();

  switch (identifier) {
    case 'webInspector':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.webInspector.plist'));
      break;
    case 'mobileSafari':
      paths.push(path.resolve(await sim.getAppDir('com.apple.mobilesafari'), 'Library', 'Preferences', 'com.apple.mobilesafari.plist'));
      break;
    case 'globalMobileSafari':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.mobilesafari.plist'));
      break;
    case 'webUI':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.WebUI.plist'));
      break;
    case 'webFoundation':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.WebFoundation.plist'));
      break;
    case 'preferences':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.Preferences.plist'));
      break;
    case 'locationServices':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.locationd.plist'));
      break;
    case 'locationClients':
      paths.push(path.resolve(simDirectory, 'Library', 'Caches', 'locationd', 'clients.plist'));
      break;
    case 'locationCache':
      paths.push(path.resolve(simDirectory, 'Library', 'Caches', 'locationd', 'cache.plist'));
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.locationd.plist'));
      break;
    case 'userSettings':
      if (semver.lt(semver.coerce(sim.xcodeVersion.versionString), semver.coerce('7.3'))) {
        paths.push(path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', 'UserSettings.plist'));
        paths.push(path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', 'EffectiveUserSettings.plist'));
        paths.push(path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist'));
      } else {
        paths.push(path.resolve(simDirectory, 'Library', 'UserConfigurationProfiles', 'UserSettings.plist'));
        paths.push(path.resolve(simDirectory, 'Library', 'UserConfigurationProfiles', 'EffectiveUserSettings.plist'));
        paths.push(path.resolve(simDirectory, 'Library', 'UserConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist'));
      }
      break;
    case 'effectiveUserSettings':
      paths.push(path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', 'EffectiveUserSettings.plist'));
      paths.push(path.resolve(simDirectory, 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist'));
      break;
    case 'accessibilitySettings':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.Accessibility.plist'));
      break;
    case 'uiStyleSettings':
      paths.push(path.resolve(simDirectory, 'Library', 'Preferences', 'com.apple.uikitservices.userInterfaceStyleMode.plist'));
      break;
  }

  return paths;
}

async function updateSettings (sim, plist, updates) {
  return await B.reduce(await plistPaths(sim, plist), async function reducer (updated, path) {
    return await update(path, updates) || updated;
  }, false);
}

// update a plist file, located at pathToPlist
// pass in an object, all settings specified in the object will be
// updated on the plist, all others left as-is
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

async function readSettings (sim, plist) {
  let settings = {};
  for (let path of await plistPaths(sim, plist)) {
    settings[path] = await read(path);
  }
  return settings;
}

async function read (pathToPlist) {
  return await plist.parsePlistFile(pathToPlist, false);
}

async function updateLocationSettings (sim, bundleId, authorized) {
  // update location cache
  const newCachePrefs = {
    LastFenceActivityTimestamp: 412122103.232983,
    CleanShutdown: true
  };
  let updated = await updateSettings(sim, 'locationCache', {[bundleId]: newCachePrefs});

  // update location clients
  const newClientPrefs = {
    BundleId: bundleId,
    Authorized: !!authorized,
    Whitelisted: false,
  };
  for (const file of await plistPaths(sim, 'locationClients')) {
    log.debug(`Updating location client file: ${file}`);

    let updates = {};

    // see if the bundle is already there
    const plist = await read(file);

    // random data that always seems to be in the clients.plist
    const weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
                        'PrivateFrameworks/AOSNotification.framework';
    if (!_.has(plist, weirdLocKey)) {
      updates[weirdLocKey] = {
        BundlePath: '/System/Library/PrivateFrameworks/AOSNotification.framework',
        Whitelisted: false,
        Executable: '',
        Registered: ''
      };
    }

    // create the update, and make sure it has sensible values
    const baseSetting = _.has(plist, bundleId) ? plist[bundleId] : {};
    updates[bundleId] = _.defaults(newClientPrefs, baseSetting);
    updates[bundleId].Executable = updates[bundleId].Executable || '';
    updates[bundleId].Registered = updates[bundleId].Registered || '';

    updated = await update(file, updates) || updated;
  }

  return updated;
}

async function setReduceMotion (sim, reduceMotion = true) {
  log.debug(`Updating reduce motion. Setting to ${reduceMotion}.`);
  const paths = await plistPaths(sim, 'accessibilitySettings');
  for (const file of paths) {
    await update(file, {
      ReduceMotionEnabled: reduceMotion ? 1 : 0
    });
  }
}

async function updateSafariGlobalSettings (sim, settingSet) {
  log.debug('Updating Safari global settings');

  let updated = false;
  for (const [file, safariSettingSet] of _.toPairs(await readSettings(sim, 'globalMobileSafari'))) {
    let newSettings = {};
    for (const [key, value] of _.toPairs(settingSet)) {
      if (safariSettingSet[key] !== value) {
        newSettings[key] = value;
      }
    }
    if (_.isEmpty(newSettings)) {
      continue;
    }

    updated = await update(file, newSettings) || updated;
  }
  return updated;
}

async function updateSafariUserSettings (sim, settingSet) {
  log.debug('Updating Safari user settings');

  // add extra stuff to UserSettings.plist and EffectiveUserSettings.plist
  let newUserSettings = {};
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

  let updated = false;
  for (const [file, userSettingSet] of _.toPairs(await readSettings(sim, 'userSettings'))) {
    // the user settings plist has two buckets, one for
    // boolean settings (`restrictedBool`) and one for
    // other value settings (`restrictedValue`). In each, the value
    // is in a `value` sub-field.
    if (!_.has(userSettingSet, 'restrictedBool')) {
      userSettingSet.restrictedBool = {};
    }
    for (let [key, value] of _.toPairs(newUserSettings)) {
      userSettingSet.restrictedBool[key] = {value};
    }

    // actually do the update
    updated = await update(file, userSettingSet) || updated;
  }

  return updated;
}

async function updateLocale (sim, language, locale, calendarFormat) {
  let globalPrefs = path.resolve(sim.getDir(), 'Library', 'Preferences',
                                 '.GlobalPreferences.plist');

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

async function stub () {
  return await plistPaths;
}

export {
  update, updateSettings, updateLocationSettings, setReduceMotion,
  updateSafariUserSettings, updateSafariGlobalSettings, updateLocale, read,
  readSettings, stub,
};
