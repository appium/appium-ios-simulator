import log from '../logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import path from 'path';

const STATUS = Object.freeze({
  UNSET: 'unset',
  NO: 'no',
  YES: 'yes',
  LIMITED: 'limited',
});


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

/**
 * Runs a command line sqlite3 query
 *
 * @param {string} db - Full path to sqlite database
 * @param {string} query - The actual query string
 * @returns {Promise<string>} sqlite command stdout
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

/**
 * Sets permissions for the given application
 *
 * @param {import('node-simctl').Simctl} simctl - node-simctl object.
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {Object} permissionsMapping - An object, where keys are service names
 * and values are corresponding state values. See the result of `xcrun simctl privacy`
 * for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
async function setAccess (simctl, bundleId, permissionsMapping) {
  const grantPermissions = [];
  const revokePermissions = [];
  const resetPermissions = [];

  for (const serviceName in permissionsMapping) {
    switch (permissionsMapping[serviceName]) {
      case STATUS.YES:
        grantPermissions.push(serviceName);
        break;
      case STATUS.NO:
        revokePermissions.push(serviceName);
        break;
      case STATUS.UNSET:
        resetPermissions.push(serviceName);
        break;
      default:
        log.warn(`${serviceName} does not support ${permissionsMapping[serviceName]}. Please specify yes, no or reset.`);
    };
  }

  log.debug(`Granting permissions for ${bundleId} as ${JSON.stringify(grantPermissions)}`);
  log.debug(`Revoking permissions for ${bundleId} as ${JSON.stringify(revokePermissions)}`);
  log.debug(`Resetting permissions for ${bundleId} as ${JSON.stringify(resetPermissions)}`);

  for (const action of grantPermissions) {
    await simctl.grantPermission(bundleId, action);
  }

  for (const action of revokePermissions) {
    await simctl.revokePermission(bundleId, action);
  }

  for (const action of resetPermissions) {
    await simctl.resetPermission(bundleId, action);
  }

  return true;
}

/**
 * Retrieves the current permission status for the given service and application.
 *
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {string} serviceName - the name of the service. Should be one of
 * `SERVICES` keys.
 * @param {string} simDataRoot - the path to Simulator `data` root
 * @returns {Promise<string>} - The current status: yes/no/unset/limited
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
 * xcrun simctl privacy for more details on the available service names and statuses.
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
 * See `xcrun simctl privacy` for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
extensions.setPermissions = async function setPermissions (bundleId, permissionsMapping) {
  log.debug(`Setting access for '${bundleId}': ${JSON.stringify(permissionsMapping, null, 2)}`);
  await setAccess(this.simctl, bundleId, permissionsMapping);
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
