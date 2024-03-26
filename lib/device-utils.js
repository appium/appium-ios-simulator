import Simctl from 'node-simctl';

/**
 * @param {import('@appium/types').StringRecord} [simctlOpts]
 * @returns {Promise<any[]>}
 */
export async function getDevices(simctlOpts) {
  return await new Simctl(simctlOpts).getDevices();
}
