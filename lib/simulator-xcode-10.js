import SimulatorXcode93 from './simulator-xcode-9.3';
import { fs, timing } from 'appium-support';
import { waitForCondition } from 'asyncbox';
import { MOBILE_SAFARI_BUNDLE_ID, SAFARI_STARTUP_TIMEOUT } from './utils';
import log from './logger';


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
      const appContainer = await this.simctl.getAppContainer(bundleId);
      if (!appContainer.endsWith('.app')) {
        return false;
      }
      return await fs.exists(appContainer);
    } catch (err) {
      // get_app_container subcommand fails for system applications,
      // so we try the hidden appinfo subcommand, which prints correct info for
      // system/hidden apps
      try {
        const info = await this.simctl.appInfo(bundleId);
        return info.includes('ApplicationType');
      } catch (ign) {}
    }
    return false;
  }

  /**
   * @override
   */
  async openUrl (url) {
    if (!await this.isRunning()) {
      throw new Error(`Tried to open '${url}', but Simulator is not in Booted state`);
    }
    const timer = new timing.Timer().start();
    await this.simctl.openUrl(url);
    let psError;
    try {
      await waitForCondition(async () => {
        let procList = [];
        try {
          procList = await this.ps();
          psError = null;
        } catch (e) {
          log.debug(e.message);
          psError = e;
        }
        return procList.some(({name}) => name === MOBILE_SAFARI_BUNDLE_ID);
      }, {
        waitMs: SAFARI_STARTUP_TIMEOUT,
        intervalMs: 500,
      });
    } catch (err) {
      const secondsElapsed = timer.getDuration().asSeconds;
      if (psError) {
        log.warn(`Mobile Safari process existence cannot be verified after ${secondsElapsed.toFixed(3)}s. ` +
          `Original error: ${psError.message}`);
        log.warn('Continuing anyway');
      } else {
        throw new Error(`Mobile Safari cannot open '${url}' after ${secondsElapsed.toFixed(3)}s. ` +
          `Its process ${MOBILE_SAFARI_BUNDLE_ID} does not exist in the list of Simulator processes`);
      }
    }
    log.debug(`Safari successfully opened '${url}' in ${timer.getDuration().asSeconds.toFixed(3)}s`);
  }
}

export default SimulatorXcode10;
