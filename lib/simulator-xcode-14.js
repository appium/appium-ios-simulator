import { SimulatorXcode11_4 } from './simulator-xcode-11.4';

/**
 * @typedef {import('./types').SupportsGeolocation} SupportsGeolocation
 */

export class SimulatorXcode14 extends SimulatorXcode11_4 {
  /**
   * @override
   * @inheritdoc
   * @param {string|number} latitude
   * @param {string|number} longitude
   * @returns {Promise<boolean>}
   */
  setGeolocation = async (latitude, longitude) => {
    await this.simctl.setLocation(latitude, longitude);
    return true;
  };
}
