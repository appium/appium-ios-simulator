import SimulatorXcode93 from './simulator-xcode-9.3';
import { getAppContainer, appInfo } from 'node-simctl';
import { fs } from 'appium-support';


class SimulatorXcode10 extends SimulatorXcode93 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  /**
   * Verify whether the particular application is installed on Simulator.
   * @override
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @return {boolean} True if the given application is installed.
   */
  async isAppInstalled (bundleId) {
    try {
      const appContainer = await getAppContainer(this.udid, bundleId, false);
      if (!appContainer.endsWith('.app')) {
        return false;
      }
      return await fs.exists(appContainer);
    } catch (err) {
      // get_app_container subcommand fails for system applications,
      // so we try the hidden appinfo subcommand, which prints correct info for
      // system/hidden apps
      try {
        const info = await appInfo(this.udid, bundleId);
        return info.includes('ApplicationType');
      } catch (ign) {}
    }
    return false;
  }
}

export default SimulatorXcode10;
