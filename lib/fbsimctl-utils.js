import log from './logger';
import { exec } from 'teen_process';
import { fs } from 'appium-support';

const FBSIMCTL = 'fbsimctl';

async function assertPresence () {
  try {
    await fs.which(FBSIMCTL);
  } catch (err) {
    throw new Error(`${FBSIMCTL} tool should be present in PATH. ` +
      `Use 'brew install fbsimctl --HEAD' command to install it`);
  }
}

async function execFbsimctl (args) {
  await assertPresence();
  log.debug(`Executing ${FBSIMCTL} with args ${JSON.stringify(args)}`);
  try {
    const {stdout} = await exec(FBSIMCTL, args);
    log.debug(`Command output: ${stdout}`);
    return stdout;
  } catch (err) {
    throw new Error(`Cannot execute ${FBSIMCTL} with arguments ${JSON.stringify(args)}. ` +
      `Original error: ${err.stderr}`);
  }
}

/**
 * Sets the given GPS coordinates for the udid Simulator.
 * The Simulator should be in booted state.
 *
 * @param {string} udid - The Simulator UDID
 * @param {string|number} latitude - Latitude value
 * @param {string|number} longitude - Longitude value
 * @throws {Error} If the command failed or fbsimctl is not present in PATH
 */
async function setGeoLocation (udid, latitude, longitude) {
  // Fail fast if the binary is not present
  await assertPresence();

  latitude = `${latitude}`.trim();
  longitude = `${longitude}`.trim();
  try {
    // Try both decimal separators
    const latitudeWithComma = latitude.replace('.', ',');
    const longitudeWithComma = longitude.replace('.', ',');
    execFbsimctl([udid, 'set_location', latitudeWithComma, longitudeWithComma]);
  } catch (err) {
    const latitudeWithDot = latitude.replace(',', '.');
    const longitudeWithDot= longitude.replace(',', '.');
    execFbsimctl([udid, 'set_location', latitudeWithDot, longitudeWithDot]);
  }
}

/**
 * Activates the window of the given simulator
 *
 * @param {string} udid - The Simulator UDID
 * @throws {Error} If the command failed or fbsimctl is not present in PATH
 */
async function focus (udid) {
  execFbsimctl([udid, 'focus']);
}

export {
  execFbsimctl, setGeoLocation, focus,
};