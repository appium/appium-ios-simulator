import _ from 'lodash';
import path from 'path';
import { fs, timing } from '@appium/support';
import B from 'bluebird';
import { MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT_MS } from '../utils';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';

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

/**
 * Open the given URL in mobile Safari browser.
 * The browser will be started automatically if it is not running.
 *
 * @this {CoreSimulatorWithSafariBrowser}
 * @param {string} url
 */
export async function openUrl (url) {
  if (!await this.isRunning()) {
    throw new Error(`Tried to open '${url}', but Simulator is not in Booted state`);
  }
  const timer = new timing.Timer().start();
  await this.simctl.openUrl(url);
  /** @type {Error|undefined|null} */
  let psError;
  try {
    await waitForCondition(async () => {
      let procList = [];
      try {
        procList = await this.ps();
        psError = null;
      } catch (e) {
        this.log.debug(e.message);
        psError = e;
      }
      return procList.some(({name}) => name === MOBILE_SAFARI_BUNDLE_ID);
    }, {
      waitMs: SAFARI_STARTUP_TIMEOUT_MS,
      intervalMs: 500,
    });
  } catch (err) {
    const secondsElapsed = timer.getDuration().asSeconds;
    if (psError) {
      this.log.warn(`Mobile Safari process existence cannot be verified after ${secondsElapsed.toFixed(3)}s. ` +
        `Original error: ${psError.message}`);
      this.log.warn('Continuing anyway');
    } else {
      throw new Error(`Mobile Safari cannot open '${url}' after ${secondsElapsed.toFixed(3)}s. ` +
        `Its process ${MOBILE_SAFARI_BUNDLE_ID} does not exist in the list of Simulator processes`);
    }
  }
  this.log.debug(`Safari successfully opened '${url}' in ${timer.getDuration().asSeconds.toFixed(3)}s`);
}

/**
 * Clean up the directories for mobile Safari.
 * Safari will be terminated if it is running.
 *
 * @this {CoreSimulatorWithSafariBrowser}
 * @param {boolean} keepPrefs - Whether to keep Safari preferences from being deleted.
 */
export async function scrubSafari (keepPrefs = true) {
  try {
    await this.terminateApp(MOBILE_SAFARI_BUNDLE_ID);
  } catch (ign) {}

  this.log.debug('Scrubbing Safari data files');
  const safariData = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  const libraryDir = path.resolve(safariData, 'Library');
  const deletePromises = DATA_FILES.map((p) => fs.rimraf(path.join(libraryDir, ...p)));
  if (!keepPrefs) {
    deletePromises.push(fs.rimraf(path.join(libraryDir, 'Preferences', '*.plist')));
  }
  await B.all(deletePromises);
}

/**
 * Updates variious Safari settings. Simulator must be booted in order to for it
 * to success.
 *
 * @this {CoreSimulatorWithSafariBrowser}
 * @param {import('@appium/types').StringRecord} updates An object containing Safari settings to be updated.
 * The list of available setting names and their values could be retrived by
 * changing the corresponding Safari settings in the UI and then inspecting
 * 'Library/Preferences/com.apple.mobilesafari.plist' file inside of
 * com.apple.mobilesafari app container.
 * The full path to the Mobile Safari's container could be retrieved from
 * `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data`
 * command output.
 * Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command
 * to print the plist content to the Terminal.
 * @returns {Promise<boolean>}
 */
export async function updateSafariSettings(updates) {
  if (_.isEmpty(updates)) {
    return false;
  }

  const containerRoot = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  const plistPath = path.join(containerRoot, 'Library', 'Preferences', 'com.apple.mobilesafari.plist');
  return await this.updateSettings(plistPath, updates);
}

/**
 * @this {CoreSimulatorWithSafariBrowser}
 * @returns {Promise<string|null>}
 */
export async function getWebInspectorSocket() {
  if (this._webInspectorSocket) {
    return this._webInspectorSocket;
  }

  // lsof -aUc launchd_sim gives a set of records like
  // https://github.com/appium/appium-ios-simulator/commit/c00901a9ddea178c5581a7a57d96d8cee3f17c59#diff-2be09dd2ea01cfd6bbbd73e10bc468da782a297365eec706999fc3709c01478dR102
  // these _appear_ to always be grouped together by PID for each simulator.
  // Therefore, by obtaining simulator PID with an expected simulator UDID,
  // we can get the correct `com.apple.webinspectord_sim.socket`
  // without depending on the order of `lsof -aUc launchd_sim` result.
  const {stdout} = await exec('lsof', ['-aUc', 'launchd_sim']);
  const udidPattern = `([0-9]{1,5}).+${this.udid}`;
  const udidMatch = stdout.match(new RegExp(udidPattern));
  if (!udidMatch) {
    this.log.debug(`Failed to get Web Inspector socket. lsof result: ${stdout}`);
    return null;
  }

  const pidPattern = `${udidMatch[1]}.+\\s+(\\S+com\\.apple\\.webinspectord_sim\\.socket)`;
  const pidMatch = stdout.match(new RegExp(pidPattern));
  if (!pidMatch) {
    this.log.debug(`Failed to get Web Inspector socket. lsof result: ${stdout}`);
    return null;
  }
  this._webInspectorSocket = pidMatch[1];
  return this._webInspectorSocket;
}

/**
 * @typedef {import('../types').CoreSimulator
 * & import('../types').InteractsWithSafariBrowser
 * & import('../types').InteractsWithApps
 * & import('../types').HasSettings} CoreSimulatorWithSafariBrowser
 */
