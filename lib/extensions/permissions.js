import _ from 'lodash';
import { fs, util } from '@appium/support';
import { exec } from 'teen_process';
import path from 'path';
import B from 'bluebird';

const STATUS = Object.freeze({
  UNSET: 'unset',
  NO: 'no',
  YES: 'yes',
  LIMITED: 'limited',
});
const WIX_SIM_UTILS = 'applesimutils';
// `location` permission does not work with WIX/applesimutils.
// Note that except for 'contacts', the Apple's privacy command sets
// permissions properly but it kills the app process while WIX/applesimutils does not.
// In the backward compatibility perspective,
// we'd like to keep the app process as possible.
const PERMISSIONS_APPLIED_VIA_SIMCTL = [
  'location',
  'location-always'
];
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

/**
 * Sets the particular permission to the application bundle. See https://github.com/wix/AppleSimulatorUtils
 * or `xcrun simctl privacy` for more details on the available service names and statuses.
 *
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} bundleId - Application bundle identifier.
 * @param {string} permission - Service name to be set.
 * @param {string} value - The desired status for the service.
 * @throws {Error} If there was an error while changing permission.
 */
export async function setPermission (bundleId, permission, value) {
  await this.setPermissions(bundleId, {[permission]: value});
}

/**
 * Sets the permissions for the particular application bundle.
 *
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} bundleId - Application bundle identifier.
 * @param {Object} permissionsMapping - A mapping where kays
 * are service names and values are their corresponding status values.
 * See https://github.com/wix/AppleSimulatorUtils or `xcrun simctl privacy`
 * for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
export async function setPermissions (bundleId, permissionsMapping) {
  this.log.debug(`Setting access for '${bundleId}': ${JSON.stringify(permissionsMapping, null, 2)}`);
  await setAccess.bind(this)(bundleId, permissionsMapping);
}

/**
 * Retrieves current permission status for the given application bundle.
 *
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} bundleId - Application bundle identifier.
 * @param {string} serviceName - One of available service names.
 * @returns {Promise<string>}
 * @throws {Error} If there was an error while retrieving permissions.
 */
export async function getPermission (bundleId, serviceName) {
  const result = await getAccess.bind(this)(bundleId, serviceName);
  this.log.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);
  return result;
}

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
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} db - Full path to sqlite database
 * @param {string} query - The actual query string
 * @returns {Promise<string>} sqlite command stdout
 */
async function execSQLiteQuery (db, query) {
  this.log.debug(`Executing SQL query "${query}" on '${db}'`);
  try {
    return (await exec('sqlite3', ['-line', db, query])).stdout;
  } catch (err) {
    throw new Error(
      `Cannot execute SQLite query "${query}" to '${db}'. Original error: ${err.stderr}`
    );
  }
}

/**
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string[]} args
 * @returns {Promise<string>}
 */
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

  this.log.debug(`Executing: ${WIX_SIM_UTILS} ${util.quote(args)}`);
  try {
    const {stdout} = await exec(WIX_SIM_UTILS, args);
    this.log.debug(`Command output: ${stdout}`);
    return stdout;
  } catch (e) {
    throw new Error(`Cannot execute "${WIX_SIM_UTILS} ${util.quote(args)}". Original error: ${e.stderr || e.message}`);
  }
}

/**
 * Sets permissions for the given application
 *
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {Object} permissionsMapping - An object, where keys are service names
 * and values are corresponding state values. Services listed in PERMISSIONS_APPLIED_VIA_SIMCTL
 * will be set with `xcrun simctl privacy` command by Apple otherwise AppleSimulatorUtils by WIX.
 * See the result of `xcrun simctl privacy` and https://github.com/wix/AppleSimulatorUtils
 * for more details on available service names and statuses.
 * Note that the `xcrun simctl privacy` command kill the app process.
 * @throws {Error} If there was an error while changing permissions.
 */
async function setAccess (bundleId, permissionsMapping) {
  const /** @type {Record<string, string>} */ wixPermissions = {};

  const /** @type {string[]} */ grantPermissions = [];
  const /** @type {string[]} */ revokePermissions = [];
  const /** @type {string[]} */ resetPermissions = [];

  for (const serviceName in permissionsMapping) {
    if (!PERMISSIONS_APPLIED_VIA_SIMCTL.includes(serviceName)) {
      wixPermissions[serviceName] = permissionsMapping[serviceName];
    } else {
      // xcrun simctl privacy expects to be lower case while AppleSimulatorUtils is upper case.
      // To keep the compatibility,  we should convert here to lower case explicitly.
      switch (_.toLower(permissionsMapping[serviceName])) {
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
          this.log.errorAndThrow(
            `${serviceName} does not support ${permissionsMapping[serviceName]}. Please specify 'yes', 'no' or 'unset'.`
          );
      }
    }
  }

  /** @type {Promise[]} */
  const permissionPromises = [];

  if (!_.isEmpty(grantPermissions)) {
    this.log.debug(`Granting ${util.pluralize('permission', grantPermissions.length, false)} for ${bundleId}: ${grantPermissions}`);
    for (const action of grantPermissions) {
      permissionPromises.push(this.simctl.grantPermission(bundleId, action));
    }
  }

  if (!_.isEmpty(revokePermissions)) {
    this.log.debug(`Revoking ${util.pluralize('permission', revokePermissions.length, false)} for ${bundleId}: ${revokePermissions}`);
    for (const action of revokePermissions) {
      permissionPromises.push(this.simctl.revokePermission(bundleId, action));
    }
  }

  if (!_.isEmpty(resetPermissions)) {
    this.log.debug(`Resetting ${util.pluralize('permission', resetPermissions.length, false)} for ${bundleId}: ${resetPermissions}`);
    for (const action of resetPermissions) {
      permissionPromises.push(this.simctl.resetPermission(bundleId, action));
    }
  }

  if (!_.isEmpty(permissionPromises)) {
    await B.all(permissionPromises);
  }

  if (!_.isEmpty(wixPermissions)) {
    this.log.debug(`Setting permissions for ${bundleId} wit ${WIX_SIM_UTILS} as ${JSON.stringify(wixPermissions)}`);
    const permissionsArg = _.toPairs(wixPermissions)
      .map((x) => `${x[0]}=${formatStatus(x[1])}`)
      .join(',');
    await execWix.bind(this)([
      '--byId', this.udid,
      '--bundle', bundleId,
      '--setPermissions', permissionsArg,
    ]);
  }

  return true;
}

/**
 * Retrieves the current permission status for the given service and application.
 *
 * @this {CoreSimulatorWithAppPermissions}
 * @param {string} bundleId - bundle identifier of the target application.
 * @param {string} serviceName - the name of the service. Should be one of
 * `SERVICES` keys.
 * @returns {Promise<string>} - The current status: yes/no/unset/limited
 * @throws {Error} If there was an error while retrieving permissions.
 */
async function getAccess (bundleId, serviceName) {
  const internalServiceName = toInternalServiceName(serviceName);
  const dbPath = path.resolve(this.getDir(), 'Library', 'TCC', 'TCC.db');
  const getAccessStatus = async (statusPairs, statusKey) => {
    for (const [statusValue, status] of statusPairs) {
      const sql = `SELECT count(*) FROM 'access' ` +
        `WHERE client='${bundleId}' AND ${statusKey}=${statusValue} AND service='${internalServiceName}'`;
      const count = await execSQLiteQuery.bind(this)(dbPath, sql);
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

/**
 * @typedef {import('../types').CoreSimulator & import('../types').SupportsAppPermissions} CoreSimulatorWithAppPermissions
 */
