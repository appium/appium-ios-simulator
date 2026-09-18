import {NativeSimctl} from '@appium/coresim';

import {createSimulator} from '../../lib/utils/create-simulator.js';

/**
 * Creates a throwaway test device by the same friendly `deviceName`/`osVersion` strings the old
 * `node-simctl`-based tests used (e.g. `'iPhone 17'`/`'26.0'`).
 *
 * @param name Display name for the new device.
 * @param deviceName Friendly device type name, e.g. `'iPhone 17'`.
 * @param osVersion iOS version string, e.g. `'26.0'`.
 * @param devicesSetPath Custom device set directory to create the device in, instead of the
 * default one.
 * @returns The new device's UDID.
 */
export async function createTestDevice(
  name: string,
  deviceName: string,
  osVersion: string,
  devicesSetPath?: string,
): Promise<string> {
  return await createSimulator(name, deviceName, osVersion, {platform: 'iOS', devicesSetPath});
}

/**
 * Deletes a device by UDID, ignoring the "not found" case — mirrors the old tests' best-effort
 * cleanup (they only bothered deleting a device if it was still present).
 *
 * @param udid UDID of the device to delete.
 * @param devicesSetPath Custom device set directory the device lives in, instead of the default one.
 */
export async function deleteTestDevice(udid: string, devicesSetPath?: string): Promise<void> {
  try {
    await new NativeSimctl(undefined, devicesSetPath).deleteDevice(udid);
  } catch {}
}
