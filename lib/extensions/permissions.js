import log from '../logger';
import _ from 'lodash';
import { fs, util } from '@appium/support';
import { exec } from 'teen_process';
import path from 'path';

const STATUS = Object.freeze({
  UNSET: 'unset',
  NO: 'no',
  YES: 'yes',
  LIMITED: 'limited',
});

const WIX_SIM_UTILS = 'applesimutils';
const SERVICES = Object.freeze({
  calendar: 'kTCCServiceCalendar',
  camera: 'kTCCServiceCamera',
  contacts: 'kTCCServiceAddressBook',
  homekit: 'kTCCServiceWillow',
  microphone: 'kTCCServiceMicrophone',
  photos: 'kTCCServicePhotos',
  reminders: 'kTCCServiceReminders',
  medialibrary: 'kTCCServiceMediaLibrary',
  motion: 'kTCCServiceMotion',
  health: 'kTCCServiceMSO',
  siri: 'kTCCServiceSiri',
  speech: 'kTCCServiceSpeechRecognition',
});

function toInternalServiceName (serviceName) {
  if (_.has(SERVICES, _.toLower(serviceName))) {
    return SERVICES[_.toLower(serviceName)];
  }
  throw new Error(
    `'${serviceName}' is unknown. Only the following service names are supported: ${JSON.stringify(_.keys(SERVICES))}`
  );
}

function formatStatus (status) {
  return [STATUS.UNSET, STATUS.NO].includes(status) ? _.toUpper(status) : status;
}

/**
 * Runs a command line sqlite3 query
 *
 * @param {string} db - Full path to sqlite database
 * @param {string} query - The actual query string
 * @returns {string} sqlite command stdout
 */
async function execSQLiteQuery (db, query) {
  log.debug(`Executing SQL query "${query}" on '${db}'`);
  try {
    return (await exec('sqlite3', ['-line', db, query])).stdout;
  } catch (err) {
    throw new Error(
      `Cannot execute SQLite query "${query}" to '${db}'. Original error: ${err.stderr}`
    );
  }
}

async function execWix (args) {
  try {
    await fs.which(WIX_SIM_UTILS);
  } catch (e) {
    throw new Error(
      `${WIX_SIM_UTILS} binary has not been found in your PATH. ` +
      `Please install it ('brew tap wix/brew && brew install wix/brew/applesimutils') to ` +
      `be able to change application permissions`
    );
  }

  log.debug(`Executing: ${WIX_SIM_UTILS} ${util.quote(args)}`);
  try {
    const {stdout} = await exec(WIX_SIM_UTILS, args);
    log.debug(`Command output: ${stdout}`);
    return stdout;
  } catch (e) {
    throw new Error(`Cannot execute "${WIX_SIM_UTILS} ${util.quote(args)}". Original error: ${e.stderr || e.message}`);
  }
}

/**
 * Sets permissions for the given application
 *
 * @param {string} udid - udid of the target simulator device.
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {Object} permissionsMapping - An object, where keys ar  service names
 * and values are corresponding state values. See https://github.com/wix/AppleSimulatorUtils
 * for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
async function setAccess (udid, bundleId, permissionsMapping) {
  const permissionsArg = _.toPairs(permissionsMapping)
    .map((x) => `${x[0]}=${formatStatus(x[1])}`)
    .join(',');
  return await execWix([
    '--byId', udid,
    '--bundle', bundleId,
    '--setPermissions', permissionsArg,
  ]);
}

/**
 * Retrieves the current permission status for the given service and application.
 *
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {string} serviceName - the name of the service. Should be one of
 * `SERVICES` keys.
 * @param {string} simDataRoot - the path to Simulator `data` root
 * @returns {string} - The current status: yes/no/unset/limited
 * @throws {Error} If there was an error while retrieving permissions.
 */
async function getAccess (bundleId, serviceName, simDataRoot) {
  const internalServiceName = toInternalServiceName(serviceName);
  const dbPath = path.resolve(simDataRoot, 'Library', 'TCC', 'TCC.db');
  const getAccessStatus = async (statusPairs, statusKey) => {
    for (const [statusValue, status] of statusPairs) {
      const sql = `SELECT count(*) FROM 'access' ` +
        `WHERE client='${bundleId}' AND ${statusKey}=${statusValue} AND service='${internalServiceName}'`;
      const count = await execSQLiteQuery(dbPath, sql);
      if (parseInt(count.split('=')[1], 10) > 0) {
        return status;
      }
    }
    return STATUS.UNSET;
  };

  // 'auth_value' existence depends on the OS version rather than Xcode version.
  // Thus here check the newer one first, then fallback to the older version way.
  try {
    // iOS 14+
    return await getAccessStatus(
      [['0', STATUS.NO], ['2', STATUS.YES], ['3', STATUS.LIMITED]],
      'auth_value'
    );
  } catch {
    return await getAccessStatus(
      [['0', STATUS.NO], ['1', STATUS.YES]],
      'allowed'
    );
  }
}

const extensions = {};

/**
 * Sets the particular permission to the application bundle. See
 * https://github.com/wix/AppleSimulatorUtils for more details on
 * the available service names and statuses.
 *
 * @param {string} bundleId - Application bundle identifier.
 * @param {string} permission - Service name to be set.
 * @param {string} value - The desired status for the service.
 * @throws {Error} If there was an error while changing permission.
 */
extensions.setPermission = async function setPermission (bundleId, permission, value) {
  await this.setPermissions(bundleId, {[permission]: value});
};

/**
 * Sets the permissions for the particular application bundle.
 *
 * @param {string} bundleId - Application bundle identifier.
 * @param {Object} permissionsMapping - A mapping where kays
 * are service names and values are their corresponding status values.
 * See https://github.com/wix/AppleSimulatorUtils
 * for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
extensions.setPermissions = async function setPermissions (bundleId, permissionsMapping) {
  log.debug(`Setting access for '${bundleId}': ${JSON.stringify(permissionsMapping, null, 2)}`);
  await setAccess(this.udid, bundleId, permissionsMapping);
};

/**
 * Retrieves current permission status for the given application bundle.
 *
 * @param {string} bundleId - Application bundle identifier.
 * @param {string} serviceName - One of available service names.
 * @throws {Error} If there was an error while retrieving permissions.
 */
extensions.getPermission = async function getPermission (bundleId, serviceName) {
  const result = await getAccess(bundleId, serviceName, this.getDir());
  log.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);
  return result;
};

export default extensions;
