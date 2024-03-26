import { fs} from '@appium/support';
import { exec } from 'teen_process';

const LYFT_SET_LOCATION = 'set-simulator-location';

/**
 * Set custom geolocation parameters for the given Simulator using AppleScript.
 *
 * @this {CoreSimulatorWithGeolocation}
 * @param {string|number} latitude - The latitude value, which is going to be entered
 *   into the corresponding edit field, for example '39,0006'.
 * @param {string|number} longitude - The longitude value, which is going to be entered
 *   into the corresponding edit field, for example '19,0068'.
 * @returns {Promise<boolean>} True if the given parameters have correct format and were successfully accepted.
 * @throws {Error} If there was an error while setting the location
 */
export async function setGeolocation (latitude, longitude) {
  const locationSetters = [
    async () => await setLocationWithLyft(this.udid, latitude, longitude),
    async () => await setLocationWithIdb(this.idb, latitude, longitude),
  ];

  let lastError;
  for (const setter of locationSetters) {
    try {
      await setter();
      return true;
    } catch (e) {
      this.log.info(e.message);
      lastError = e;
    }
  }
  throw lastError;
}

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
 * @typedef {import('../types').CoreSimulator & import('../types').SupportsGeolocation} CoreSimulatorWithGeolocation
 */
