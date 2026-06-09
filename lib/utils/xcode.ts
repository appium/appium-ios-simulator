import {exec} from 'teen_process';
import type {XcodeVersion} from 'appium-xcode';
import {MIN_SUPPORTED_XCODE_VERSION} from './constants';

/**
 * @returns Promise that resolves to the developer root path.
 */
export async function getDeveloperRoot(): Promise<string> {
  const {stdout} = await exec('xcode-select', ['-p']);
  return stdout.trim();
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
