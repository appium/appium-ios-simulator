import _ from 'lodash';
import path from 'path';
import { fs, plist, util } from '@appium/support';
import B from 'bluebird';
import { waitForCondition } from 'asyncbox';

/**
 * Install valid .app package on Simulator.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} app - The path to the .app package.
 */
export async function installApp (app) {
  return await this.simctl.installApp(app);
}

/**
 * Returns user installed bundle ids which has 'bundleName' in their Info.Plist as 'CFBundleName'
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleName - The bundle name of the application to be checked.
 * @return {Promise<string[]>} - The list of bundle ids which have 'bundleName'
 */
export async function getUserInstalledBundleIdsByBundleName (bundleName) {
  const appsRoot = path.resolve(this.getDir(), 'Containers', 'Bundle', 'Application');
  // glob all Info.plist from simdir/data/Containers/Bundle/Application
  const infoPlists = await fs.glob('*/*.app/Info.plist', {
    cwd: appsRoot,
    absolute: true,
  });
  if (_.isEmpty(infoPlists)) {
    return [];
  }

  const bundleInfoPromises = [];
  for (const infoPlist of infoPlists) {
    bundleInfoPromises.push((async () => {
      try {
        return await plist.parsePlistFile(infoPlist);
      } catch (ign) {}
    })());
  }
  const bundleInfos = (await B.all(bundleInfoPromises)).filter(_.isPlainObject);
  const bundleIds = bundleInfos
    .filter(({ CFBundleName }) => CFBundleName === bundleName)
    .map(({ CFBundleIdentifier }) => CFBundleIdentifier);
  if (_.isEmpty(bundleIds)) {
    return [];
  }

  this.log.debug(
    `The simulator has ${util.pluralize('bundle', bundleIds.length, true)} which ` +
    `have '${bundleName}' as their 'CFBundleName': ${JSON.stringify(bundleIds)}`
  );
  return bundleIds;
}

/**
 * Verify whether the particular application is installed on Simulator.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - The bundle id of the application to be checked.
 * @return {Promise<boolean>} True if the given application is installed.
 */
export async function isAppInstalled (bundleId) {
  try {
    const appContainer = await this.simctl.getAppContainer(bundleId);
    if (!appContainer.endsWith('.app')) {
      return false;
    }
    return await fs.exists(appContainer);
  } catch (err) {
    // get_app_container subcommand fails for system applications,
    // so we try the hidden appinfo subcommand, which prints correct info for
    // system/hidden apps
    try {
      const info = await this.simctl.appInfo(bundleId);
      return info.includes('ApplicationType');
    } catch (ign) {}
  }
  return false;
}

/**
 * Uninstall the given application from the current Simulator.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - The buindle ID of the application to be removed.
 */
export async function removeApp (bundleId) {
  await this.simctl.removeApp(bundleId);
}

/**
 * Starts the given application on Simulator
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - The buindle ID of the application to be launched
 * @param {import('../types').LaunchAppOptions} [opts={}]
 */
export async function launchApp (bundleId, opts = {}) {
  await this.simctl.launchApp(bundleId);
  const {
    wait = false,
    timeoutMs = 10000,
  } = opts;
  if (!wait) {
    return;
  }

  try {
    await waitForCondition(async () => await this.isAppRunning(bundleId), {
      waitMs: timeoutMs,
      intervalMs: 300
    });
  } catch (e) {
    throw new Error(`App '${bundleId}' is not runnning after ${timeoutMs}ms timeout.`);
  }
}

/**
 * Stops the given application on  Simulator.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - The buindle ID of the application to be stopped
 */
export async function terminateApp (bundleId) {
  await this.simctl.terminateApp(bundleId);
}

/**
 * Check if app with the given identifier is running.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - The buindle ID of the application to be checked.
 */
export async function isAppRunning (bundleId) {
  return (await this.ps()).some(({name}) => name === bundleId);
}

/**
 * Scrub (delete the preferences and changed files) the particular application on Simulator.
 * The app will be terminated automatically if it is running.
 *
 * @this {CoreSimulatorWithApps}
 * @param {string} bundleId - Bundle identifier of the application.
 * @throws {Error} if the given app is not installed.
 */
export async function scrubApp (bundleId) {
  const appDataRoot = await this.simctl.getAppContainer(bundleId, 'data');
  const appFiles = await fs.glob('**/*', {
    cwd: appDataRoot,
    nodir: true,
    absolute: true,
  });
  this.log.info(`Found ${appFiles.length} ${bundleId} app ${util.pluralize('file', appFiles.length, false)} to scrub`);
  if (_.isEmpty(appFiles)) {
    return;
  }

  try {
    await this.terminateApp(bundleId);
  } catch (ign) {}
  await B.all(appFiles.map((p) => fs.rimraf(p)));
}

/**
 * @typedef {import('../types').CoreSimulator & import('../types').InteractsWithApps} CoreSimulatorWithApps
 */
