import _ from 'lodash';
import { fs, timing, util } from '@appium/support';
import { exec } from 'teen_process';
import path from 'path';
import B from 'bluebird';
import { waitForCondition } from 'asyncbox';
import type { CoreSimulator, SupportsAppPermissions } from '../types';
import type { StringRecord } from '@appium/types';

type CoreSimulatorWithAppPermissions = CoreSimulator & SupportsAppPermissions;

const STATUS = Object.freeze({
  UNSET: 'unset',
  NO: 'no',
  YES: 'yes',
  LIMITED: 'limited',
} as const);
const SPRINGBOARD_BUNDLE_ID = 'com.apple.SpringBoard';
const SPOTLIGHT_BUNDLE_ID = 'com.apple.Spotlight';
const WIX_SIM_UTILS = 'applesimutils';
const SERVICES_NEED_SPRINGBOARD_RESTART = ['notifications'];
const SYSTEM_SERVICE_RESTART_TIMEOUT_MS = 15000;
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
} as const);

/**
 * Sets the particular permission to the application bundle. See https://github.com/wix/AppleSimulatorUtils
 * or `xcrun simctl privacy` for more details on the available service names and statuses.
 *
 * @param bundleId Application bundle identifier.
 * @param permission Service name to be set.
 * @param value The desired status for the service.
 * @throws {Error} If there was an error while changing permission.
 */
export async function setPermission(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  permission: string,
  value: string
): Promise<void> {
  await this.setPermissions(bundleId, {[permission]: value});
}

/**
 * Sets the permissions for the particular application bundle.
 *
 * @param bundleId Application bundle identifier.
 * @param permissionsMapping A mapping where keys
 * are service names and values are their corresponding status values.
 * See https://github.com/wix/AppleSimulatorUtils or `xcrun simctl privacy`
 * for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
export async function setPermissions(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  permissionsMapping: StringRecord
): Promise<void> {
  this.log.debug(`Setting access for '${bundleId}': ${JSON.stringify(permissionsMapping, null, 2)}`);
  await setAccess.bind(this)(bundleId, permissionsMapping);
}

/**
 * Retrieves current permission status for the given application bundle.
 *
 * @param bundleId Application bundle identifier.
 * @param serviceName One of available service names.
 * @returns Promise that resolves to the permission status
 * @throws {Error} If there was an error while retrieving permissions.
 */
export async function getPermission(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  serviceName: string
): Promise<string> {
  const result = await getAccess.bind(this)(bundleId, serviceName);
  this.log.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);
  return result;
}

function toInternalServiceName(serviceName: string): string {
  const lowerName = _.toLower(serviceName);
  if (_.has(SERVICES, lowerName)) {
    return SERVICES[lowerName as keyof typeof SERVICES] as string;
  }
  throw new Error(
    `'${serviceName}' is unknown. Only the following service names are supported: ${JSON.stringify(_.keys(SERVICES))}`
  );
}

function formatStatus(status: string): string {
  return (status === STATUS.UNSET || status === STATUS.NO) ? _.toUpper(status) : status;
}

/**
 * Runs a command line sqlite3 query
 *
 * @param db Full path to sqlite database
 * @param query The actual query string
 * @returns Promise that resolves to sqlite command stdout
 */
async function execSQLiteQuery(this: CoreSimulatorWithAppPermissions, db: string, query: string): Promise<string> {
  this.log.debug(`Executing SQL query "${query}" on '${db}'`);
  try {
    return (await exec('sqlite3', ['-line', db, query])).stdout;
  } catch (err: any) {
    throw new Error(
      `Cannot execute SQLite query "${query}" to '${db}'. Original error: ${err.stderr}`
    );
  }
}

/**
 * @param args Command arguments
 * @returns Promise that resolves to command stdout
 */
async function execWix(this: CoreSimulatorWithAppPermissions, args: string[]): Promise<string> {
  try {
    await fs.which(WIX_SIM_UTILS);
  } catch {
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
  } catch (e: any) {
    throw new Error(`Cannot execute "${WIX_SIM_UTILS} ${util.quote(args)}". Original error: ${e.stderr || e.message}`);
  }
}

/**
 * Sets permissions for the given application
 *
 * @param bundleId bundle identifier of the target application.
 * @param permissionsMapping An object, where keys are service names
 * and values are corresponding state values. Services listed in PERMISSIONS_APPLIED_VIA_SIMCTL
 * will be set with `xcrun simctl privacy` command by Apple otherwise AppleSimulatorUtils by WIX.
 * See the result of `xcrun simctl privacy` and https://github.com/wix/AppleSimulatorUtils
 * for more details on available service names and statuses.
 * Note that the `xcrun simctl privacy` command kill the app process.
 * @throws {Error} If there was an error while changing permissions.
 */
async function setAccess(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  permissionsMapping: StringRecord
): Promise<boolean> {
  const wixPermissions: Record<string, string> = {};

  const grantPermissions: string[] = [];
  const revokePermissions: string[] = [];
  const resetPermissions: string[] = [];

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
          throw this.log.errorWithException(
            `${serviceName} does not support ${permissionsMapping[serviceName]}. Please specify 'yes', 'no' or 'unset'.`
          );
      }
    }
  }

  const permissionPromises: Promise<any>[] = [];

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
    const execWixFn = async () => await execWix.bind(this)([
      '--byId', this.udid,
      '--bundle', bundleId,
      '--setPermissions', permissionsArg,
    ]);
    const shouldWaitForSystemReadiness = !_.isEmpty(
      _.intersection(SERVICES_NEED_SPRINGBOARD_RESTART, _.keys(wixPermissions))
    );
    if (shouldWaitForSystemReadiness) {
      const [didTimeout] = await runAndWaitForSystemReadiness.bind(this)(
        execWixFn, SYSTEM_SERVICE_RESTART_TIMEOUT_MS
      );
      if (didTimeout) {
        this.log.warn(
          `The required system services did not restart after ` +
          `${SYSTEM_SERVICE_RESTART_TIMEOUT_MS}ms timeout. This might lead to unexpected consequences later.`
        );
      }
    } else {
      await execWixFn();
    }
  }

  return true;
}

/**
 * Waiting for springboard restart and applications process end/restart
 * triggered by the springboard process restart.
 *
 * @template T
 * @param fn Function to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that resolves to a tuple of [didTimeout, result]
 */
async function runAndWaitForSystemReadiness<T>(this: CoreSimulator, fn: () => Promise<T>, timeoutMs: number): Promise<[boolean, T]> {
  const waitForNewPid = async (initialPid: number | undefined, bundleId: string, timeoutMs: number) => {
    await waitForCondition(async () => {
      try {
        const pid = (await this.ps()).find(({name}) => bundleId === name)?.pid;
        return _.isInteger(pid) && initialPid !== pid;
      } catch {
        return false;
      }
    }, {waitMs: timeoutMs, intervalMs: 500});
  };

  let initialProcesses: any[] = [];
  try {
    initialProcesses = await this.ps();
  } catch {}

  const [initialSpringboardPid, initialSpotlightPid] = [
    SPRINGBOARD_BUNDLE_ID, SPOTLIGHT_BUNDLE_ID
  ].map((bundleId) => initialProcesses.find(({name}) => bundleId === name)?.pid);

  const result = await fn();
  if (!_.isInteger(initialSpringboardPid) || !_.isInteger(initialSpotlightPid)) {
    // there is no point to wait if relevant processes were not running before
    return [false, result];
  }

  try {
    // Make sure the springboard process restarted first.
    const timer = new timing.Timer().start();
    await waitForNewPid(initialSpringboardPid, SPRINGBOARD_BUNDLE_ID, timeoutMs);
    const remainingTimeoutMs = timeoutMs - timer.getDuration().asMilliSeconds;
    if (remainingTimeoutMs <= 0) {
      // no need to check the SPOTLIGHT_BUNDLE_ID
      return [true, result];
    }

    // Then, checking if the new spring board process refreshes applications.
    // Spotlight.app is widely used so the app process can be an indicator to check the refresh.
    await waitForNewPid(initialSpotlightPid, SPOTLIGHT_BUNDLE_ID, remainingTimeoutMs);
  } catch {
    return [true, result];
  }
  return [false, result];
}

/**
 * Retrieves the current permission status for the given service and application.
 *
 * @param bundleId bundle identifier of the target application.
 * @param serviceName the name of the service. Should be one of
 * `SERVICES` keys.
 * @returns The current status: yes/no/unset/limited
 * @throws {Error} If there was an error while retrieving permissions.
 */
async function getAccess(this: CoreSimulatorWithAppPermissions, bundleId: string, serviceName: string): Promise<string> {
  const internalServiceName = toInternalServiceName(serviceName);
  const dbPath = path.resolve(this.getDir(), 'Library', 'TCC', 'TCC.db');
  const getAccessStatus = async (statusPairs: [string, string][], statusKey: string) => {
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

