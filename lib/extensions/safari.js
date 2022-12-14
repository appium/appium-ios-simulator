import _ from 'lodash';
import path from 'path';
import { fs, timing } from '@appium/support';
import log from '../logger';
import B from 'bluebird';
import {
  MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT, launchApp,
} from '../utils';

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
    await launchApp(this.simctl, MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT);
    await this.simctl.openUrl(url);
  } catch (err) {
    throw new Error(`Safari could not open '${url}' after ${timer.getDuration().asSeconds.toFixed(3)}s. ` +
      `Original error: ${err.stderr || err.message}`);
  }
  log.debug(`Safari successfully opened '${url}' in ${timer.getDuration().asSeconds.toFixed(3)}s`);
};

/**
 * Clean up the directories for mobile Safari.
 *
 * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
 */
extensions.cleanSafari = async function cleanSafari (keepPrefs = true) {
  try {
    if (await this.isRunning()) {
      await this.simctl.terminateApp(MOBILE_SAFARI_BUNDLE_ID);
    }
  } catch (ign) {}

  log.debug('Cleaning mobile safari data files');
  if (await this.isFresh()) {
    log.info(
      'Could not find Safari support directories to clean out old data. ' +
      'Probably there is nothing to clean out'
    );
    return;
  }

  let safariData = null;
  try {
    safariData = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  } catch (ign) {};
  if (!safariData) {
    log.info(
      'Could not find Safari support directories to clean out old ' +
      'data. Probably there is nothing to clean out'
    );
    return;
  }
  const libraryDir = path.resolve(safariData, 'Library');
  const filesToDelete = [
    ['Caches', '*'],
    ['Image Cache', '*'],
    ['WebKit', MOBILE_SAFARI_BUNDLE_ID, '*'],
    ['WebKit', 'GeolocationSites.plist'],
    ['WebKit', 'LocalStorage', '*.*'],
    ['Safari', '*'],
    ['Cookies', '*.binarycookies'],
    ['..', 'tmp', MOBILE_SAFARI_BUNDLE_ID, '*'],
  ];
  const deletePromises = filesToDelete.map((p) => fs.rimraf(path.resolve(libraryDir, ...p)));
  if (!keepPrefs) {
    deletePromises.push(fs.rimraf(path.resolve(libraryDir, 'Preferences', '*.plist')));
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
