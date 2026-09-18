import type {SimulatorInfoOptions, SimulatorListEntry} from '../types.js';
import {listSimulators} from './list-simulators.js';

/**
 * @param udid - The simulator UDID.
 * @param opts - Options including devicesSetPath.
 * @returns Promise that resolves to simulator info or undefined if not found.
 */
export async function getSimulatorInfo(
  udid: string,
  opts: SimulatorInfoOptions = {},
): Promise<SimulatorListEntry | undefined> {
  const devices = await listSimulators(opts);
  const normalizedUdid = String(udid).toLowerCase();
  return devices.find((sim) => sim.udid.toLowerCase() === normalizedUdid);
}

/**
 * @param udid - The simulator UDID.
 * @returns Promise that resolves to true if simulator exists, false otherwise.
 */
export async function simExists(udid: string): Promise<boolean> {
  return !!(await getSimulatorInfo(udid));
}
