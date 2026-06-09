import {fs} from '@appium/support';
import {exec} from 'teen_process';
import path from 'node:path';
import type {XcodeVersion} from 'appium-xcode';
import {MIN_DEVICE_HUB_XCODE_VERSION, MIN_SUPPORTED_XCODE_VERSION} from './constants';

/**
 * @returns Promise that resolves to the developer root path.
 */
export async function getDeveloperRoot(): Promise<string> {
  const {stdout} = await exec('xcode-select', ['-p']);
  return stdout.trim();
}

/**
 * @param bundleId - The bundle identifier of the Simulator UI client.
 * @param xcodeVersion - The active Xcode version.
 * @returns The full path to the UI client app in the active Xcode installation.
 * @throws {Error} If no matching app is found in the active Xcode folder.
 */
export async function getUiClientAppPath(
  bundleId: string,
  xcodeVersion: XcodeVersion,
): Promise<string> {
  const devRoot = await getDeveloperRoot();
  const applicationsDir =
    xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION
      ? path.resolve(devRoot, '..', 'Applications')
      : path.resolve(devRoot, 'Applications');

  if (await fs.exists(applicationsDir)) {
    const appPaths = (await fs.readdir(applicationsDir))
      .filter((entry) => entry.endsWith('.app'))
      .map((entry) => path.resolve(applicationsDir, entry));
    const apps = await Promise.all(
      appPaths.map(async (appPath) => ({
        appPath,
        bundleId: await readBundleIdFromPlist(path.resolve(appPath, 'Contents', 'Info.plist')),
      })),
    );
    const match = apps.find((app) => app.bundleId === bundleId);
    if (match) {
      return match.appPath;
    }
  }

  throw new Error(
    `Could not find UI client app with bundle id '${bundleId}' in the active Xcode folder (${devRoot})`,
  );
}

/**
 * Asserts that the Xcode version meets the minimum supported version requirement.
 *
 * @template V - The Xcode version type.
 * @param xcodeVersion - The Xcode version to check.
 * @returns The same Xcode version if it meets the requirement.
 * @throws {Error} If the Xcode version is below the minimum supported version.
 */
export function assertXcodeVersion<V extends XcodeVersion>(xcodeVersion: V): V {
  if (xcodeVersion.major < MIN_SUPPORTED_XCODE_VERSION) {
    throw new Error(
      `Tried to use an iOS simulator with xcode version ${xcodeVersion.versionString} but only Xcode version ` +
        `${MIN_SUPPORTED_XCODE_VERSION} and up are supported`,
    );
  }
  return xcodeVersion;
}

/**
 * @param infoPlistPath - The full path to an Info.plist file.
 * @returns The bundle identifier or null if it cannot be read.
 */
export async function readBundleIdFromPlist(infoPlistPath: string): Promise<string | null> {
  try {
    const {stdout} = await exec('/usr/libexec/PlistBuddy', [
      '-c',
      'print CFBundleIdentifier',
      infoPlistPath,
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
