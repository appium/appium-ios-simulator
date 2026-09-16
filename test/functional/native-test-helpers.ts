import {NativeSimctl} from '@appium/coresim';

/**
 * Creates a throwaway test device by the same friendly `deviceName`/`osVersion` strings the old
 * `node-simctl`-based tests used (e.g. `'iPhone 17'`/`'26.0'`), resolving them to the exact
 * `deviceTypeIdentifier`/`runtimeIdentifier` `@appium/coresim`'s `createDevice` requires.
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
  const nativeSimctl = new NativeSimctl(undefined, devicesSetPath);
  const [deviceTypes, runtimes] = await Promise.all([
    nativeSimctl.getSupportedDeviceTypes(),
    nativeSimctl.getSupportedRuntimes(),
  ]);
  const deviceType = deviceTypes.find((t) => t.name === deviceName);
  if (!deviceType) {
    throw new Error(
      `No supported device type named '${deviceName}'. Available: ${deviceTypes.map((t) => t.name).join(', ')}`,
    );
  }
  const iosRuntimes = runtimes.filter((r) => r.identifier.includes('.SimRuntime.iOS-'));
  // Exact match first; CI images sometimes ship a patch bump (e.g. '26.4.1') for a runtime named
  // after its minor version ('26.4'), so fall back to a dotted-prefix match for that case.
  const runtime =
    iosRuntimes.find((r) => r.versionString === osVersion) ??
    iosRuntimes.find((r) => r.versionString.startsWith(`${osVersion}.`));
  if (!runtime) {
    throw new Error(
      `No supported iOS runtime with version '${osVersion}'. Available: ${iosRuntimes.map((r) => r.versionString).join(', ')}`,
    );
  }
  const device = await nativeSimctl.createDevice(name, deviceType.identifier, runtime.identifier);
  return device.udid;
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
