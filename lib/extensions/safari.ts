import _ from 'lodash';
import path from 'path';
import { fs, timing } from '@appium/support';
import B from 'bluebird';
import { MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT_MS } from '../utils';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';
import type { CoreSimulator, InteractsWithSafariBrowser, InteractsWithApps, HasSettings } from '../types';
import type { StringRecord } from '@appium/types';

type CoreSimulatorWithSafariBrowser = CoreSimulator & InteractsWithSafariBrowser & InteractsWithApps & HasSettings;

// The root of all these files is located under Safari data container root
// in 'Library' subfolder
const DATA_FILES: string[][] = [
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
 * @param url URL to open
 */
export async function openUrl(this: CoreSimulatorWithSafariBrowser, url: string): Promise<void> {
  if (!await this.isRunning()) {
    throw new Error(`Tried to open '${url}', but Simulator is not in Booted state`);
  }
  const timer = new timing.Timer().start();
  await this.simctl.openUrl(url);
  let psError: Error | undefined | null;
  try {
    await waitForCondition(async () => {
      let procList: any[] = [];
      try {
        procList = await this.ps();
        psError = null;
      } catch (e: any) {
        this.log.debug(e.message);
        psError = e;
      }
      return procList.some(({name}) => name === MOBILE_SAFARI_BUNDLE_ID);
    }, {
      waitMs: SAFARI_STARTUP_TIMEOUT_MS,
      intervalMs: 500,
    });
  } catch {
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
 * @param keepPrefs Whether to keep Safari preferences from being deleted.
 */
export async function scrubSafari(this: CoreSimulatorWithSafariBrowser, keepPrefs: boolean = true): Promise<void> {
  try {
    await this.terminateApp(MOBILE_SAFARI_BUNDLE_ID);
  } catch {}

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
 * Updates various Safari settings. Simulator must be booted in order for it
 * to success.
 *
 * @param updates An object containing Safari settings to be updated.
 * The list of available setting names and their values could be retrieved by
 * changing the corresponding Safari settings in the UI and then inspecting
 * 'Library/Preferences/com.apple.mobilesafari.plist' file inside of
 * com.apple.mobilesafari app container.
 * The full path to the Mobile Safari's container could be retrieved from
 * `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data`
 * command output.
 * Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command
 * to print the plist content to the Terminal.
 * @returns Promise that resolves to true if settings were updated
 */
export async function updateSafariSettings(this: CoreSimulatorWithSafariBrowser, updates: StringRecord): Promise<boolean> {
  if (_.isEmpty(updates)) {
    return false;
  }

  const containerRoot = await this.simctl.getAppContainer(MOBILE_SAFARI_BUNDLE_ID, 'data');
  const plistPath = path.join(containerRoot, 'Library', 'Preferences', 'com.apple.mobilesafari.plist');
  return await this.updateSettings(plistPath, updates);
}

/**
 * @returns Promise that resolves to the Web Inspector socket path or null
 */
export async function getWebInspectorSocket(this: CoreSimulatorWithSafariBrowser): Promise<string | null> {
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
  if (!pidMatch || !pidMatch[1]) {
    this.log.debug(`Failed to get Web Inspector socket. lsof result: ${stdout}`);
    return null;
  }
  const socketPath = pidMatch[1];
  this._webInspectorSocket = socketPath;
  return socketPath;
}

