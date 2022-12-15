import _ from 'lodash';
import path from 'path';
import { fs, timing } from '@appium/support';
import log from '../logger';
import B from 'bluebird';
import { MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT_MS } from '../utils';

// The root of all these files is located under Safari data container root
// in 'Library' subfolder
const DATA_FILES = [
  ['Caches', '*'],
  ['Image Cache', '*'],
  ['WebKit', MOBILE_SAFARI_BUNDLE_ID, '*'],
  ['WebKit', 'GeolocationSites.plist'],
  ['WebKit', 'LocalStorage', '*.*'],
  ['Safari', '*'],
  ['Cookies', '*.binarycookies'],
  ['..', 'tmp', MOBILE_SAFARI_BUNDLE_ID, '*'],
];

const extensions = {};

/**
 * Open the given URL in mobile Safari browser.
 * The browser will be started automatically if it is not running.
 *
 * @param {string} url - The URL to be opened.
 */
extensions.openUrl = async function openUrl (url) {
  if (!await this.isRunning()) {
    throw new Error(`Tried to open '${url}', but Simulator is not in Booted state`);
  }
  const timer = new timing.Timer().start();
  try {
    await this.launchApp(MOBILE_SAFARI_BUNDLE_ID, {
      wait: true,
      timeoutMs: SAFARI_STARTUP_TIMEOUT_MS,
    });
    await this.simctl.openUrl(url);
  } catch (err) {
    throw new Error(`Safari could not open '${url}' after ${timer.getDuration().asSeconds.toFixed(3)}s. ` +
      `Original error: ${err.stderr || err.message}`);
  }
  log.debug(`Safari successfully opened '${url}' in ${timer.getDuration().asSeconds.toFixed(3)}s`);
};

/**
 * Clean up the directories for mobile Safari.
 * Safari will be terminated if it is running.
 *
 * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
 */
extensions.scrubSafari = async function scrubSafari (keepPrefs = true) {
  try {
    await this.terminateApp(MOBILE_SAFARI_BUNDLE_ID);
  } catch (ign) {}

  log.debug('Scrubbing Safari data files');
  const safariData = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  const libraryDir = path.resolve(safariData, 'Library');
  const deletePromises = DATA_FILES.map((p) => fs.rimraf(path.join(libraryDir, ...p)));
  if (!keepPrefs) {
    deletePromises.push(fs.rimraf(path.join(libraryDir, 'Preferences', '*.plist')));
  }
  await B.all(deletePromises);
};

/**
 * Updates variious Safari settings. Simulator must be booted in order to for it
 * to success.
 *
 * @param {object} updates An object containing Safari settings to be updated.
 * The list of available setting names and their values could be retrived by
 * changing the corresponding Safari settings in the UI and then inspecting
 * 'Library/Preferences/com.apple.mobilesafari.plist' file inside of
 * com.apple.mobilesafari app container.
 * The full path to the Mobile Safari's container could be retrieved from
 * `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data`
 * command output.
 * Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command
 * to print the plist content to the Terminal.
 */
extensions.updateSafariSettings = async function updateSafariSettings (updates) {
  if (_.isEmpty(updates)) {
    return false;
  }

  const containerRoot = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  const plistPath = path.join(containerRoot, 'Library', 'Preferences', 'com.apple.mobilesafari.plist');
  return await this.updateSettings(plistPath, updates);
};

export default extensions;
