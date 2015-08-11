import bplistCreator from 'bplist-creator';
import bplistParser from 'bplist-parser';
import B from 'bluebird';
import _ from 'lodash';
import { fs } from 'appium-support';
import path from 'path';
import log from './logger';

let parseFile = B.promisify(bplistParser.parseFile);

// TODO webinspector needs to be added post
// TODO clients need to be added post, but only for older ios versions? and the options are different

// returns path to plist based on id for plist.
// these ids are appium terms
function plistPaths (sim, identifier) {
  let paths = [];
  switch (identifier) {
    case 'webInspector':
      paths.push(path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.webInspector.plist'));
      break;
    case 'mobileSafari':
      paths.push(path.resolve(sim.getAppDataDir('com.apple.mobilesafari'), 'Library', 'Preferences', 'com.apple.mobilesafari.plist'));
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

// update a plist file, located at pathToPlist
// pass in an object, all settings specified in the object will be
// updated on the plist, all others left as-is
async function update (pathToPlist, updates) {
  log.debug(`Updating settings for ${pathToPlist}`);
  log.debug(`    ${JSON.stringify(updates)}`);
  let currentSettings = await read(pathToPlist);

  let newSettings = _.merge(currentSettings, updates);
  let bplist = bplistCreator(newSettings);

  let fd = await fs.open(pathToPlist, 'w');
  await fs.write(fd, bplist, 0, bplist.length);
  fs.close(fd);

  return newSettings;
}

async function read (pathToPlist) {
  log.debug(`Retrieving settings for ${pathToPlist}`);
  return parseFile(pathToPlist);
}

async function updateLocationSettings (sim, bundleId, authorized) {
  // update location cache
  let newCachePrefs = {
    LastFenceActivityTimestamp: 412122103.232983,
    CleanShutdown: true
  };
  for (let file of plistPaths(sim, 'locationCache')) {
    log.debug(`Updating cache file: ${file}`);
    await update(file, [{
      [bundleId]: newCachePrefs
    }]);
  }

  // update location clients
  let newClientPrefs = {
    BundleId: bundleId,
    Authorized: !!authorized,
    Whitelisted: false,
  };
  for (let file of plistPaths(sim, 'locationClients')) {
    log.debug(`Updating cache file: ${file}`);

    let updates = {};

    // see if the bundle is already there
    let plist = await read(file);

    // random data that always seems to be in the clients.plist
    let weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
                      'PrivateFrameworks/AOSNotification.framework';
    if (!_.has(plist[0], weirdLocKey)) {
      updates[weirdLocKey] = {
        BundlePath: '/System/Library/PrivateFrameworks/AOSNotification.framework',
        Whitelisted: false,
        Executable: '',
        Registered: ''
      };
    }

    // create the update, and make sure it has sensible values
    let baseSetting = _.has(plist[0], bundleId) ? plist[0][bundleId] : {};
    updates[bundleId] = _.defaults(newClientPrefs, baseSetting);
    updates[bundleId].Executable = updates[bundleId].Executable || '';
    updates[bundleId].Registered = updates[bundleId].Registered || '';

    await update(file, [updates]);
  }
}

async function stub () {
  return plistPaths;
}

export { update, read, updateLocationSettings, stub };
