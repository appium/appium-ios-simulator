import type {NativeSimctl} from '@appium/coresim';

/**
 * Resolves the full path to where the simulator's system R/O volume is mounted.
 *
 * @param nativeSimctl The native driver to read the environment through.
 * @param udid UDID of the (booted) device.
 * @returns The full path to the system root.
 */
export async function getSystemRoot(nativeSimctl: NativeSimctl, udid: string): Promise<string> {
  const simRoot = await nativeSimctl.getEnv(udid, 'IPHONE_SIMULATOR_ROOT');
  if (!simRoot) {
    throw new Error('The IPHONE_SIMULATOR_ROOT environment variable value cannot be retrieved');
  }
  return simRoot.trim();
}
