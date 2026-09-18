import type {DeviceListEntry, SimulatorInfoOptions} from '../types.js';
import {getDevices} from './get-devices.js';

/**
 * @param udid - The simulator UDID.
 * @param opts - Options including devicesSetPath.
 * @returns Promise that resolves to simulator info or undefined if not found.
 */
export async function getSimulatorInfo(
  udid: string,
  opts: SimulatorInfoOptions = {},
): Promise<DeviceListEntry | undefined> {
  const devices = await getDevices(opts);
  return devices.find((sim) => sim.udid === udid);
}

/**
 * @param udid - The simulator UDID.
 * @returns Promise that resolves to true if simulator exists, false otherwise.
 */
export async function simExists(udid: string): Promise<boolean> {
  return !!(await getSimulatorInfo(udid));
}
