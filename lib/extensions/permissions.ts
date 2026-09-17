import type {SimPermissionService} from '@appium/coresim';
import {timing, util} from '@appium/support';
import type {StringRecord} from '@appium/types';
import {waitForCondition} from 'asyncbox';
import {exec} from 'teen_process';

import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, ProcessInfo, SupportsAppPermissions} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsAppPermissions {}
}

type CoreSimulatorWithAppPermissions = CoreSimulator & SupportsAppPermissions & HasNativeSimctl;

const STATUS = Object.freeze({
  UNSET: 'unset',
  NO: 'no',
  YES: 'yes',
  LIMITED: 'limited',
} as const);
const SPRINGBOARD_BUNDLE_ID = 'com.apple.SpringBoard';
const SPOTLIGHT_BUNDLE_ID = 'com.apple.Spotlight';
const SERVICES_NEED_SPRINGBOARD_RESTART = ['notifications'];
const SYSTEM_SERVICE_RESTART_TIMEOUT_MS = 15000;
// `location`/`location-always` are the only services CoreSimulator's TCC database doesn't model as
// a plain row (CoreLocation simulation is a separate subsystem) — @appium/coresim's grantPermission/
// revokePermission/resetPermission/getPermission deliberately exclude them, so these two keep going
// through `xcrun simctl privacy` directly instead.
const PERMISSIONS_APPLIED_VIA_SIMCTL = ['location', 'location-always'];
// Every service @appium/coresim's SimPermissionService union supports — kept as an explicit list
// (rather than trusting caller input) so an unsupported name fails with a clear error up front.
// `notifications` is intentionally NOT supported: unlike every service below, it was never a plain
// TCC row — the previous AppleSimulatorUtils-backed setter wrote a hand-built legacy bplist into
// BulletinBoard/SectionInfo.plist (itself marked "Legacy"/"Xcode 9 support" in that project's own
// source), which has no confirmed modern equivalent. This is a deliberate breaking change.
const SERVICES: readonly SimPermissionService[] = Object.freeze([
  'calendar',
  'camera',
  'contacts',
  'faceid',
  'health',
  'homekit',
  'medialibrary',
  'microphone',
  'motion',
  'photos',
  'reminders',
  'siri',
  'speech',
  'usertracking',
]);

/**
 * Sets the particular permission to the application bundle. See `xcrun simctl privacy` for more
 * details on the available service names and statuses.
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
  value: string,
): Promise<void> {
  await this.setPermissions(bundleId, {[permission]: value});
}

/**
 * Sets the permissions for the particular application bundle.
 *
 * @param bundleId Application bundle identifier.
 * @param permissionsMapping A mapping where keys
 * are service names and values are their corresponding status values.
 * See `xcrun simctl privacy` for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
export async function setPermissions(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  permissionsMapping: StringRecord,
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
  serviceName: string,
): Promise<string> {
  const result = await getAccess.bind(this)(bundleId, serviceName);
  this.log.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);
  return result;
}

function toPermissionService(serviceName: string): SimPermissionService {
  const lowerName = serviceName.toLowerCase();
  if ((SERVICES as readonly string[]).includes(lowerName)) {
    return lowerName as SimPermissionService;
  }
  throw new Error(
    `'${serviceName}' is unknown. Only the following service names are supported: ${JSON.stringify(SERVICES)}`,
  );
}

function formatStatus(status: string): string {
  return status === STATUS.UNSET || status === STATUS.NO ? status.toUpperCase() : status;
}

/**
 * Runs `xcrun simctl privacy <udid> <action> <service> <bundleId>` — the one permission action
 * CoreSimulator models outside a plain TCC row (see `PERMISSIONS_APPLIED_VIA_SIMCTL`), so it stays
 * CLI-based rather than going through `@appium/coresim`.
 */
async function execSimctlPrivacy(
  this: CoreSimulatorWithAppPermissions,
  action: 'grant' | 'revoke' | 'reset',
  service: string,
  bundleId: string,
): Promise<void> {
  const args = this.devicesSetPath ? ['--set', this.devicesSetPath] : [];
  await exec('xcrun', ['simctl', ...args, 'privacy', this.udid, action, service, bundleId]);
}

/**
 * Sets permissions for the given application
 *
 * @param bundleId bundle identifier of the target application.
 * @param permissionsMapping An object, where keys are service names
 * and values are corresponding state values. Services listed in PERMISSIONS_APPLIED_VIA_SIMCTL
 * will be set with `xcrun simctl privacy` command by Apple otherwise via the native TCC database.
 * See the result of `xcrun simctl privacy` for more details on available service names and statuses.
 * @throws {Error} If there was an error while changing permissions.
 */
async function setAccess(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  permissionsMapping: StringRecord,
): Promise<boolean> {
  const nativePermissions: Record<string, string> = {};

  const grantPermissions: string[] = [];
  const revokePermissions: string[] = [];
  const resetPermissions: string[] = [];

  for (const serviceName in permissionsMapping) {
    if (!PERMISSIONS_APPLIED_VIA_SIMCTL.includes(serviceName)) {
      nativePermissions[serviceName] = permissionsMapping[serviceName];
    } else {
      // xcrun simctl privacy expects to be lower case while the previous WIX-based path was upper
      // case. To keep the compatibility, we should convert here to lower case explicitly.
      switch (permissionsMapping[serviceName]?.toLowerCase()) {
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
            `${serviceName} does not support ${permissionsMapping[serviceName]}. Please specify 'yes', 'no' or 'unset'.`,
          );
      }
    }
  }

  const permissionPromises: Promise<void>[] = [];

  if (grantPermissions.length > 0) {
    this.log.debug(
      `Granting ${util.pluralize('permission', grantPermissions.length, false)} for ${bundleId}: ${grantPermissions}`,
    );
    for (const service of grantPermissions) {
      permissionPromises.push(execSimctlPrivacy.call(this, 'grant', service, bundleId));
    }
  }

  if (revokePermissions.length > 0) {
    this.log.debug(
      `Revoking ${util.pluralize('permission', revokePermissions.length, false)} for ${bundleId}: ${revokePermissions}`,
    );
    for (const service of revokePermissions) {
      permissionPromises.push(execSimctlPrivacy.call(this, 'revoke', service, bundleId));
    }
  }

  if (resetPermissions.length > 0) {
    this.log.debug(
      `Resetting ${util.pluralize('permission', resetPermissions.length, false)} for ${bundleId}: ${resetPermissions}`,
    );
    for (const service of resetPermissions) {
      permissionPromises.push(execSimctlPrivacy.call(this, 'reset', service, bundleId));
    }
  }

  if (permissionPromises.length > 0) {
    await Promise.all(permissionPromises);
  }

  if (Object.keys(nativePermissions).length > 0) {
    this.log.debug(`Setting permissions for ${bundleId} natively: ${JSON.stringify(nativePermissions)}`);
    const setNativePermissions = async () => {
      await Promise.all(
        Object.entries(nativePermissions).map(([name, status]) =>
          setNativePermission.call(this, bundleId, name, status),
        ),
      );
    };
    const shouldWaitForSystemReadiness = SERVICES_NEED_SPRINGBOARD_RESTART.some(
      (service) => service in nativePermissions,
    );
    if (shouldWaitForSystemReadiness) {
      const [didTimeout] = await runAndWaitForSystemReadiness.bind(this)(
        setNativePermissions,
        SYSTEM_SERVICE_RESTART_TIMEOUT_MS,
      );
      if (didTimeout) {
        this.log.warn(
          `The required system services did not restart after ` +
            `${SYSTEM_SERVICE_RESTART_TIMEOUT_MS}ms timeout. This might lead to unexpected consequences later.`,
        );
      }
    } else {
      await setNativePermissions();
    }
  }

  return true;
}

async function setNativePermission(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  serviceName: string,
  status: string,
): Promise<void> {
  const service = toPermissionService(serviceName);
  switch (formatStatus(status).toLowerCase()) {
    case STATUS.YES:
      return await this._native.grantPermission(this.udid, service, bundleId);
    case STATUS.LIMITED:
      // Only valid for 'photos' ("selected photos" access) — @appium/coresim rejects it for every
      // other service with a typed error, which is left to propagate as-is.
      return await this._native.grantPermission(this.udid, service, bundleId, 'limited');
    case STATUS.NO:
      return await this._native.revokePermission(this.udid, service, bundleId);
    case STATUS.UNSET:
      return await this._native.resetPermission(this.udid, service, bundleId);
    default:
      throw this.log.errorWithException(`'${status}' is not a supported value for '${serviceName}'`);
  }
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
async function runAndWaitForSystemReadiness<T>(
  this: CoreSimulator,
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<[boolean, T]> {
  const waitForNewPid = async (initialPid: number | undefined, bundleId: string, timeoutMs: number) => {
    await waitForCondition(
      async () => {
        try {
          const pid = (await this.ps()).find(({name}) => bundleId === name)?.pid;
          return Number.isInteger(pid) && initialPid !== pid;
        } catch {
          return false;
        }
      },
      {waitMs: timeoutMs, intervalMs: 500},
    );
  };

  let initialProcesses: ProcessInfo[] = [];
  try {
    initialProcesses = await this.ps();
  } catch {}

  const [initialSpringboardPid, initialSpotlightPid] = [SPRINGBOARD_BUNDLE_ID, SPOTLIGHT_BUNDLE_ID].map(
    (bundleId) => initialProcesses.find(({name}) => bundleId === name)?.pid,
  );

  const result = await fn();
  if (!Number.isInteger(initialSpringboardPid) || !Number.isInteger(initialSpotlightPid)) {
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
 * @param serviceName the name of the service. Should be one of the supported service names.
 * @returns The current status: yes/no/unset/limited
 * @throws {Error} If there was an error while retrieving permissions.
 */
async function getAccess(
  this: CoreSimulatorWithAppPermissions,
  bundleId: string,
  serviceName: string,
): Promise<string> {
  const service = toPermissionService(serviceName);
  const status = await this._native.getPermission(this.udid, service, bundleId);
  switch (status) {
    case 'granted':
      return STATUS.YES;
    case 'denied':
      return STATUS.NO;
    case 'limited':
      return STATUS.LIMITED;
    default:
      return STATUS.UNSET;
  }
}
