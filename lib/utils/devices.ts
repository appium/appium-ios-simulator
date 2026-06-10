import type {SimulatorInfoOptions} from './types';
import {getDevices} from './get-devices';

/**
 * @param udid - The simulator UDID.
 * @param opts - Options including devicesSetPath.
 * @returns Promise that resolves to simulator info or undefined if not found.
 */
export async function getSimulatorInfo(
  udid: string,
  opts: SimulatorInfoOptions = {},
): Promise<any> {
  const {devicesSetPath} = opts;
  // see the README for github.com/appium/node-simctl for example output of getDevices()
  const devices = Object.values(await getDevices({devicesSetPath})).flat();
  return devices.find((sim: any) => sim.udid === udid);
}

/**
 * @param udid - The simulator UDID.
 * @returns Promise that resolves to true if simulator exists, false otherwise.
 */
export async function simExists(udid: string): Promise<boolean> {
  return !!(await getSimulatorInfo(udid));
}
