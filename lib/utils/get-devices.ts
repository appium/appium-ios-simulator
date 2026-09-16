import {toDeviceListEntry, type DeviceListEntry} from '../native/device-info.js';
import {createNativeSimctl} from '../native/native-simctl.js';
import type {SimulatorInfoOptions} from './types.js';

/**
 * @param opts - Optional lookup options (currently just `devicesSetPath`)
 * @returns Promise that resolves to the flat list of every device in the device set
 */
export async function getDevices(opts: SimulatorInfoOptions = {}): Promise<DeviceListEntry[]> {
  const nativeSimctl = createNativeSimctl(opts.devicesSetPath);
  const devices = await nativeSimctl.getDevices();
  return devices.map(toDeviceListEntry);
}
