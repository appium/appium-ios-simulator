import Simctl from 'node-simctl';

/**
 * @param {Record<string, any>} [simctlOpts]
 * @returns {Promise<any[]>}
 */
export async function getDevices(simctlOpts) {
  return await new Simctl(simctlOpts).getDevices();
}
