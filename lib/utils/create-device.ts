import {createNativeSimctl} from '../native/native-simctl.js';
import type {CreateDeviceOptions} from '../types.js';

/**
 * Creates a new Simulator device, resolving the given friendly `deviceTypeName`/`platformVersion`
 * strings (e.g. `'iPhone 17'`/`'18.0'`) to the exact `deviceTypeIdentifier`/`runtimeIdentifier`
 * `@appium/coresim`'s native `createDevice` requires.
 *
 * @param name Display name for the new device.
 * @param deviceTypeName Friendly device type name, e.g. `'iPhone 17'`.
 * @param platformVersion Platform version string, e.g. `'18.0'`.
 * @param opts.platform The name of the simulator platform. `'iOS'` by default.
 * @param opts.devicesSetPath Custom device set directory to create the device in, instead of the
 * default one.
 * @returns The new device's UDID.
 * @throws {Error} If no matching device type or platform runtime is available.
 */
export async function createDevice(
  name: string,
  deviceTypeName: string,
  platformVersion: string,
  opts: CreateDeviceOptions = {},
): Promise<string> {
  const {platform = 'iOS', devicesSetPath} = opts;
  const nativeSimctl = createNativeSimctl(devicesSetPath);
  const [deviceTypes, runtimes] = await Promise.all([
    nativeSimctl.getSupportedDeviceTypes(),
    nativeSimctl.getSupportedRuntimes(),
  ]);
  const deviceType = deviceTypes.find((t) => t.name === deviceTypeName);
  if (!deviceType) {
    throw new Error(
      `No supported device type named '${deviceTypeName}'. Available: ${deviceTypes.map((t) => t.name).join(', ')}`,
    );
  }
  const platformRuntimes = runtimes.filter((r) => r.identifier.includes(`.SimRuntime.${platform}-`));
  // Exact match first; some environments ship a patch bump (e.g. '18.4.1') for a runtime named
  // after its minor version ('18.4'), so fall back to a dotted-prefix match for that case.
  const runtime =
    platformRuntimes.find((r) => r.versionString === platformVersion) ??
    platformRuntimes.find((r) => r.versionString.startsWith(`${platformVersion}.`));
  if (!runtime) {
    throw new Error(
      `No supported ${platform} runtime with version '${platformVersion}'. ` +
        `Available: ${platformRuntimes.map((r) => r.versionString).join(', ')}`,
    );
  }
  const device = await nativeSimctl.createDevice(name, deviceType.identifier, runtime.identifier);
  return device.udid;
}
