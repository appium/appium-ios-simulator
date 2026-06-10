import {Simctl} from 'node-simctl';
import type {StringRecord} from '@appium/types';

/**
 * @param simctlOpts - Optional simctl options
 * @returns Promise that resolves to a record of devices grouped by SDK version
 */
export async function getDevices(simctlOpts?: StringRecord): Promise<Record<string, any[]>> {
  return await new Simctl(simctlOpts).getDevices();
}
