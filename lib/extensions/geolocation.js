import _ from 'lodash';
import { fs} from '@appium/support';
import log from '../logger';
import { exec } from 'teen_process';

const LYFT_SET_LOCATION = 'set-simulator-location';
const DECIMAL_SEPARATOR_SCRIPT = `
use framework "Foundation"
use framework "AppKit"
use scripting additions

set theFormatter to current application's NSNumberFormatter's new()
set result to theFormatter's decimalSeparator()
log result as string
`;

/**
 * Set custom geolocation parameters for the given Simulator using LYFT_SET_LOCATION.
 *
 * @param {string} udid - The udid to set the given geolocation
 * @param {string|number} latitude - The latitude value, which is going to be entered
 *   into the corresponding edit field, for example '39,0006'.
 * @param {string|number} longitude - The longitude value, which is going to be entered
 *   into the corresponding edit field, for example '19,0068'.
 * @throws {Error} If it failed to set the location
 */
async function setLocationWithLyft (udid, latitude, longitude) {
  try {
    await fs.which(LYFT_SET_LOCATION);
  } catch (e) {
    throw new Error(`'${LYFT_SET_LOCATION}' binary has not been found in your PATH. ` +
      'Please install it as "brew install lyft/formulae/set-simulator-location" by brew or ' +
      'read https://github.com/MobileNativeFoundation/set-simulator-location to set ' +
      'the binary by manual to be able to set geolocation by the library.');
  }

  try {
    await exec(LYFT_SET_LOCATION, [
      '-c', `${latitude}`, `${longitude}`,
      '-u', udid
    ]);
  } catch (e) {
    throw new Error(`Failed to set geolocation with '${LYFT_SET_LOCATION}'. ` +
      `Original error: ${e.stderr || e.message}`);
  }
}

/**
 * Set custom geolocation parameters for the given Simulator using idb.
 *
 * @param {Object} idb - The IDB instance
 * @param {string|number} latitude - The latitude value, which is going to be entered
 *   into the corresponding edit field, for example '39,0006'.
 * @param {string|number} longitude - The longitude value, which is going to be entered
 *   into the corresponding edit field, for example '19,0068'.
 * @throws {Error} If it failed to set the location
 */
async function setLocationWithIdb (idb, latitude, longitude) {
  if (!idb) {
    throw new Error('Failed to set geolocation with idb because it is not installed or the "launchWithIDB" capability was not set');
  }

  try {
    await idb.setLocation(latitude, longitude);
  } catch (e) {
    throw new Error(`Failed to set geolocation with idb. Original error: ${e.stderr || e.message}`);
  }
}

/**
 * Set custom geolocation parameters for the given Simulator using AppleScript
 *
 * @param {Object} sim - The SimulatorXcode object
 * @param {string|number} latitude - The latitude value, which is going to be entered
 *   into the corresponding edit field, for example '39,0006'.
 * @param {string|number} longitude - The longitude value, which is going to be entered
 *   into the corresponding edit field, for example '19,0068'.
 * @param {string} [menu=Debug] - The menu field in which the 'Location' feature is found
 * @throws {Error} If it failed to set the location
 */
async function setLocationWithAppleScript (sim, latitude, longitude, menu = 'Debug') {
  // Make sure system-wide decimal separator is used
  const {stdout, stderr} = await exec('osascript', ['-e', DECIMAL_SEPARATOR_SCRIPT]);
  const decimalSeparator = _.trim(stdout || stderr);
  const [latitudeStr, longitudeStr] = [latitude, longitude]
    .map((coord) => `${coord}`.replace(/[.,]/, decimalSeparator));

  const output = await sim.executeUIClientScript(`
    tell application "System Events"
      tell process "Simulator"
        set featureName to "Custom Location"
        set dstMenuItem to menu item (featureName & "…") of menu 1 of menu item "Location" of menu 1 of menu bar item "${menu}" of menu bar 1
        click dstMenuItem
        delay 1
        set value of text field 1 of window featureName to "${latitudeStr}"
        delay 0.5
        set value of text field 2 of window featureName to "${longitudeStr}"
        delay 0.5
        click button "OK" of window featureName
        delay 0.5
        set isInvisible to (not (exists (window featureName)))
      end tell
    end tell
  `);
  log.debug(`Geolocation parameters dialog accepted: ${output}`);
  if (_.trim(output) !== 'true') {
    throw new Error(`Failed to set geolocation with AppleScript. Original error: ${output}`);
  }
}

const extensions = {};

/**
 * Set custom geolocation parameters for the given Simulator using AppleScript.
 *
 * @param {string|number} latitude - The latitude value, which is going to be entered
 *   into the corresponding edit field, for example '39,0006'.
 * @param {string|number} longitude - The longitude value, which is going to be entered
 *   into the corresponding edit field, for example '19,0068'.
 * @returns {Promise<boolean>} True if the given parameters have correct format and were successfully accepted.
 * @throws {Error} If there was an error while setting the location
 */
extensions.setGeolocation = async function setGeolocation (latitude, longitude) {
  const locationSetters = [
    async () => await setLocationWithLyft(this.udid, latitude, longitude),
    async () => await setLocationWithIdb(this.idb, latitude, longitude),
    async () => await setLocationWithAppleScript(this, latitude, longitude, this._locationMenu),
  ];

  let lastError;
  for (const setter of locationSetters) {
    try {
      await setter();
      return true;
    } catch (e) {
      log.info(e.message);
      lastError = e;
    }
  }
  throw lastError;
};

export default extensions;
