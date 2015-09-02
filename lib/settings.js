import _ from 'lodash';
import { plist } from 'appium-support';
import path from 'path';
import log from './logger';


// TODO webinspector needs to be added post
// TODO clients need to be added post, but only for older ios versions? and the options are different

// returns path to plist based on id for plist.
// these ids are appium terms
async function plistPaths (sim, identifier) {
  let paths = [];
  switch (identifier) {
    case 'webInspector':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.webInspector.plist'));
      break;
    case 'mobileSafari':
      paths.push(path.resolve(await sim.getAppDataDir('com.apple.mobilesafari'), 'Library', 'Preferences', 'com.apple.mobilesafari.plist'));
      break;
    case 'webUI':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.WebUI.plist'));
      break;
    case 'webFoundation':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.WebFoundation.plist'));
      break;
    case 'preferences':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.Preferences.plist'));
      break;
    case 'locationServices':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.locationd.plist'));
      break;
    case 'locationClients':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Caches', 'locationd', 'clients.plist'));
      break;
    case 'locationCache':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Caches', 'locationd', 'cache.plist'));
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.locationd.plist'));
      break;
    case 'userSettings':
      paths.push(path.resolve(sim.getDir(), 'Library', 'ConfigurationProfiles', 'UserSettings.plist'));
      paths.push(path.resolve(sim.getDir(), 'Library', 'ConfigurationProfiles', 'EffectiveUserSettings.plist'));
      paths.push(path.resolve(sim.getDir(), 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist'));
      break;
    case 'effectiveUserSettings':
      paths.push(path.resolve(sim.getDir(), 'Libary', 'ConfigurationProfiles', 'EffectiveUserSettings.plist'));
      paths.push(path.resolve(sim.getDir(), 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist'));
      break;
  }

  return paths;
}

async function updateSettings (sim, plist, updates) {
  log.debug(`Updating settings for '${plist}'`);
  let paths = await plistPaths(sim, plist);
  for (let path of paths) {
    await update(path, updates);
  }
}

// update a plist file, located at pathToPlist
// pass in an object, all settings specified in the object will be
// updated on the plist, all others left as-is
async function update (pathToPlist, updates) {
  log.debug(`Updating settings for '${pathToPlist}'`);
  log.debug(`    ${JSON.stringify(updates)}`);

  let currentSettings = await read(pathToPlist);
  let newSettings = _.merge(currentSettings, updates);
  await plist.updatePlistFile(pathToPlist, newSettings, true);

  return newSettings;
}

async function readSettings (sim, plist) {
  log.debug(`Retrieving settings for '${plist}'`);
  let settings = {};
  let paths = await plistPaths(sim, plist);
  for (let path of paths) {
    settings[path] = await read(path);
  }
  return settings;
}

async function read (pathToPlist) {
  log.debug(`Retrieving settings for ${pathToPlist}`);
  return await plist.parsePlistFile(pathToPlist);
}

async function updateLocationSettings (sim, bundleId, authorized) {
  // update location cache
  let newCachePrefs = {
    LastFenceActivityTimestamp: 412122103.232983,
    CleanShutdown: true
  };
  await updateSettings(sim, 'locationCache', {[bundleId]: newCachePrefs});

  // update location clients
  let newClientPrefs = {
    BundleId: bundleId,
    Authorized: !!authorized,
    Whitelisted: false,
  };
  for (let file of await plistPaths(sim, 'locationClients')) {
    log.debug(`Updating location client file: ${file}`);

    let updates = {};

    // see if the bundle is already there
    let plist = await read(file);

    // random data that always seems to be in the clients.plist
    let weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
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
    let baseSetting = _.has(plist, bundleId) ? plist[bundleId] : {};
    updates[bundleId] = _.defaults(newClientPrefs, baseSetting);
    updates[bundleId].Executable = updates[bundleId].Executable || '';
    updates[bundleId].Registered = updates[bundleId].Registered || '';

    await update(file, updates);
  }
}

async function updateSafariUserSettings (sim, settingSet) {
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
  if (_.size(newUserSettings) > 0) {
    log.debug('Updating Safari user settings');
    let curUserSettings = await readSettings(sim, 'userSettings');
    for (let [file, userSettingSet] of _.pairs(curUserSettings)) {
      // the user settings plist has two buckets, one for
      // boolean settings (`restrictedBool`) and one for
      // other value settings (`restrictedValue`). In each, the value
      // is in a `value` sub-field.
      if (!_.has(userSettingSet, 'restrictedBool')) {
        userSettingSet.restrictedBool = {};
      }
      for (let [key, value] of _.pairs(newUserSettings)) {
        userSettingSet.restrictedBool[key] = {value};
      }

      // actually do the update
      await update(file, userSettingSet);
    }
  }
}

async function updateLocale (sim, language, locale, calendarFormat) {
  let globalPrefs = path.resolve(sim.getDir(), 'Library', 'Preferences',
                                 '.GlobalPreferences.plist');

  // get the current data
  let data = await read(globalPrefs);
  let updates = {};

  // if we are setting the language, add it to the list of languages
  if (language) {
    log.debug(`New language: ${language}`);
    let supportedLangs = data.AppleLanguages || [];
    updates.AppleLanguages = [language].concat(_.without(supportedLangs, language));
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
    log.debug(`New locale: ${newLocaleAndCal}`);
    updates.AppleLocale = newLocaleAndCal;
  }

  log.debug('Writing new locale plist data');
  await update(globalPrefs, updates);
}

async function stub () {
  return await plistPaths;
}

export { update, updateSettings, updateLocationSettings,
         updateSafariUserSettings, updateLocale, read, readSettings, stub };
