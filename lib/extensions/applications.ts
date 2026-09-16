import path from 'node:path';

import {fs, plist, util} from '@appium/support';
import {waitForCondition} from 'asyncbox';

import {getSystemRoot} from '../native/system-root.js';
import type {HasNativeSimctl} from '../native/types.js';
import type {AppContainerType, CoreSimulator, InteractsWithApps, LaunchAppOptions} from '../types.js';
import {readBundleIdFromPlist} from '../utils/index.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends InteractsWithApps {}
}

type CoreSimulatorWithApps = CoreSimulator & InteractsWithApps & HasNativeSimctl;

interface PlistBundleInfo {
  CFBundleName?: string;
  CFBundleIdentifier?: string;
}

/**
 * Install valid .app package on Simulator.
 *
 * @param app The path to the .app package.
 */
export async function installApp(this: CoreSimulatorWithApps, app: string): Promise<void> {
  return await this._native.installApp(this.udid, app);
}

/**
 * Returns user installed bundle ids which has 'bundleName' in their Info.Plist as 'CFBundleName'
 *
 * @param bundleName The bundle name of the application to be checked.
 * @return The list of bundle ids which have 'bundleName'
 */
export async function getUserInstalledBundleIdsByBundleName(
  this: CoreSimulatorWithApps,
  bundleName: string,
): Promise<string[]> {
  const appsRoot = path.resolve(this.getDir(), 'Containers', 'Bundle', 'Application');
  // glob all Info.plist from simdir/data/Containers/Bundle/Application
  const infoPlists = await fs.glob('*/*.app/Info.plist', {
    cwd: appsRoot,
    absolute: true,
  });
  if (infoPlists.length === 0) {
    return [];
  }

  const bundleInfoPromises: Promise<PlistBundleInfo | null>[] = [];
  for (const infoPlist of infoPlists) {
    bundleInfoPromises.push(
      (async () => {
        try {
          return (await plist.parsePlistFile(infoPlist)) as PlistBundleInfo;
        } catch {
          return null;
        }
      })(),
    );
  }
  const bundleInfos = (await Promise.all(bundleInfoPromises)).filter((info): info is PlistBundleInfo =>
    util.isPlainObject(info),
  );
  const bundleIds = bundleInfos
    .filter(
      ({CFBundleName, CFBundleIdentifier}) => CFBundleName === bundleName && typeof CFBundleIdentifier === 'string',
    )
    .map(({CFBundleIdentifier}) => CFBundleIdentifier as string);
  if (bundleIds.length === 0) {
    return [];
  }

  this.log.debug(
    `The simulator has ${util.pluralize('bundle', bundleIds.length, true)} which ` +
      `have '${bundleName}' as their 'CFBundleName': ${JSON.stringify(bundleIds)}`,
  );
  return bundleIds;
}

/**
 * Uninstall the given application from the current Simulator.
 *
 * @param bundleId The bundle ID of the application to be removed.
 */
export async function removeApp(this: CoreSimulatorWithApps, bundleId: string): Promise<void> {
  await this._native.removeApp(this.udid, bundleId);
}

/**
 * Starts the given application on Simulator
 *
 * @param bundleId The bundle ID of the application to be launched
 * @param opts Launch options
 */
export async function launchApp(
  this: CoreSimulatorWithApps,
  bundleId: string,
  opts: LaunchAppOptions = {},
): Promise<void> {
  const {wait = false, timeoutMs = 10000, environment, terminateExisting} = opts;
  const nativeOptions: Record<string, unknown> = {};
  if (environment) {
    nativeOptions.environment = environment;
  }
  if (terminateExisting) {
    nativeOptions.terminate_running_process = true;
  }
  await this._native.launchApp(this.udid, bundleId, nativeOptions);
  if (!wait) {
    return;
  }

  try {
    await waitForCondition(async () => await this.isAppRunning(bundleId), {
      waitMs: timeoutMs,
      intervalMs: 300,
    });
  } catch {
    throw new Error(`App '${bundleId}' is not runnning after ${timeoutMs}ms timeout.`);
  }
}

/**
 * Stops the given application on Simulator.
 *
 * @param bundleId The bundle ID of the application to be stopped
 */
export async function terminateApp(this: CoreSimulatorWithApps, bundleId: string): Promise<void> {
  await this._native.terminateApp(this.udid, bundleId);
}

/**
 * Resolves the full filesystem path to one of an installed app's on-disk containers.
 *
 * @param bundleId Bundle identifier of the installed app.
 * @param containerType `'app'` (the default) for the `.app` bundle itself, `'data'` for its data
 * container, `'groups'` for its sole App Group container, or a specific App Group identifier.
 */
export async function getAppContainer(
  this: CoreSimulatorWithApps,
  bundleId: string,
  containerType: AppContainerType = 'app',
): Promise<string> {
  return await this._native.getAppContainer(this.udid, bundleId, containerType);
}

/**
 * @param bundleId Bundle identifier of the installed app.
 * @returns The app's properties, as reported by CoreSimulator's own `propertiesOfApplication:`.
 */
export async function appInfo(this: CoreSimulatorWithApps, bundleId: string): Promise<Record<string, unknown>> {
  return await this._native.appInfo(this.udid, bundleId);
}

/**
 * Verify whether the particular application is installed on Simulator.
 *
 * @param bundleId The bundle id of the application to be checked.
 * @return True if the given application is installed.
 */
export async function isAppInstalled(this: CoreSimulatorWithApps, bundleId: string): Promise<boolean> {
  try {
    const appContainer = await this.getAppContainer(bundleId);
    return appContainer.endsWith('.app') && (await fs.exists(appContainer));
  } catch {
    // get_app_container fails for system applications, as well as appInfo
    return (await fetchSystemAppBundleIds.call(this)).has(bundleId);
  }
}

/**
 * Collects and caches bundle identifiers of system Simulator apps.
 *
 * @returns A set of system app bundle identifiers
 */
async function fetchSystemAppBundleIds(this: CoreSimulatorWithApps): Promise<Set<string>> {
  if (this._systemAppBundleIds) {
    return this._systemAppBundleIds;
  }

  const appsRoot = path.resolve(await getSystemRoot(this._native, this.udid), 'Applications');
  const allApps = (await fs.readdir(appsRoot)).filter((x) => x.endsWith('.app')).map((x) => path.join(appsRoot, x));
  const bundleIds = await Promise.all(
    allApps.map((appRoot) => readBundleIdFromPlist(path.resolve(appRoot, 'Info.plist'))),
  );
  this._systemAppBundleIds = new Set(bundleIds.filter((x): x is string => x !== null));
  return this._systemAppBundleIds;
}

/**
 * Check if app with the given identifier is running.
 *
 * @param bundleId The bundle ID of the application to be checked.
 */
export async function isAppRunning(this: CoreSimulatorWithApps, bundleId: string): Promise<boolean> {
  return (await this.ps()).some(({name}) => name === bundleId);
}

/**
 * Scrub (delete the preferences and changed files) the particular application on Simulator.
 * The app will be terminated automatically if it is running.
 *
 * @param bundleId Bundle identifier of the application.
 * @throws {Error} if the given app is not installed.
 */
export async function scrubApp(this: CoreSimulatorWithApps, bundleId: string): Promise<void> {
  const appDataRoot = await this.getAppContainer(bundleId, 'data');
  const appFiles = await fs.glob('**/*', {
    cwd: appDataRoot,
    nodir: true,
    absolute: true,
  });
  this.log.info(`Found ${appFiles.length} ${bundleId} app ${util.pluralize('file', appFiles.length, false)} to scrub`);
  if (appFiles.length === 0) {
    return;
  }

  try {
    await this.terminateApp(bundleId);
  } catch {}
  await Promise.all(appFiles.map((p) => fs.rimraf(p)));
}
