import bplistCreator from 'bplist-creator';
import bplistParser from 'bplist-parser';
import B from 'bluebird';
import _ from 'lodash';
import fs from 'fs';
import path from 'path';

let parseFile = B.promisify(bplistParser.parseFile);
let write = B.promisify(fs.write);
let open = B.promisify(fs.open);
let close = B.promisify(fs.close);

// TODO webinspector needs to be added post
// TODO clients need to be added post, but only for older ios versions? and the options are different

// returns path to plist based on id for plist.
// these ids are appium terms
var plistPath = function(sim, identifier) {
  switch (identifier) {
    case 'webInspector':
      return path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.webInspector.plist');
    case 'mobileSafari':
      return path.resolve(sim.getAppDataDir('com.apple.mobilesafari'), 'Library', 'Preferences', 'com.apple.mobilesafari.plist');
    case 'webUI':
      return path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.WebUI.plist');
    case 'preferences':
      return path.resolve(sim.getDir(), 'Library', 'Preferences', 'com.apple.Preferences.plist');
    case 'locationClients':
      return path.resolve(sim.getDir(), 'Library', 'caches', 'locationd', 'clients.plist');
    case 'locationCache':
      return path.resolve(sim.getDir(), 'Library', 'caches', 'locationd', 'cache.plist');
    case 'userSettings':
      return path.resolve(sim.getDir(), 'Library', 'ConfigurationProfiles', 'UserSettings.plist');
    case 'EffectiveUserSettings':
      return path.resolve(sim.getDir(), 'Libary', 'ConfigurationProfiles', 'EffectiveUserSettings.plist');
  }
};

// update a plist file, located at pathToPlist
// pass in an object, all settings specified in the object will be
// updated on the plist, all others left as-is
async function update (pathToPlist, updates) {

  let currentSettings = await parseFile(pathToPlist);

  let newSettings = _.merge(currentSettings, updates);

  let bplist = bplistCreator(newSettings);

  let fd = await open(pathToPlist, 'w');
  await write(fd, bplist, 0, bplist.length);
  close(fd);

  return newSettings;
}

// TODO authorize location services for app, but this might no longer be needed
// for ios 8.4

async function stub () {
  return plistPath;
}

export { update, stub };
