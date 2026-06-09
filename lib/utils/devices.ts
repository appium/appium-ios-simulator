import {Simctl} from 'node-simctl';
import type {StringRecord} from '@appium/types';
import type {SimulatorInfoOptions} from './types';
// it's a hack needed to stub getDevices in tests
import * as utilsModule from './index';

/**
 * @param simctlOpts - Optional simctl options
 * @returns Promise that resolves to a record of devices grouped by SDK version
 */
export async function getDevices(simctlOpts?: StringRecord): Promise<Record<string, any[]>> {
  return await new Simctl(simctlOpts).getDevices();
}

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
  const devices = Object.values(await utilsModule.getDevices({devicesSetPath})).flat();
  return devices.find((sim: any) => sim.udid === udid);
}

/**
 * @param udid - The simulator UDID.
 * @returns Promise that resolves to true if simulator exists, false otherwise.
 */
export async function simExists(udid: string): Promise<boolean> {
  return !!(await getSimulatorInfo(udid));
}
