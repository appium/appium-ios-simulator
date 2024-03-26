import { fs } from '@appium/support';
import { exec } from 'teen_process';
import path from 'path';
import _ from 'lodash';
import B from 'bluebird';
import { SimulatorXcode14 } from './simulator-xcode-14';

export class SimulatorXcode15 extends SimulatorXcode14 {
  /** @type {Set<string>} */
  _systemAppBundleIds;

  /**
   * Retrives the full path to where the simulator system R/O volume is mounted
   *
   * @returns {Promise<string>}
   */
  async _getSystemRoot() {
    const simRoot = await this.simctl.getEnv('IPHONE_SIMULATOR_ROOT');
    if (!simRoot) {
      throw new Error('The IPHONE_SIMULATOR_ROOT environment variable value cannot be retrieved');
    }
    return _.trim(simRoot);
  }

  /**
   * Collects and caches bundle indetifier of system Simulator apps
   *
   * @returns {Promise<Set<string>>}
   */
  async _fetchSystemAppBundleIds () {
    if (this._systemAppBundleIds) {
      return this._systemAppBundleIds;
    }

    const appsRoot = path.resolve(await this._getSystemRoot(), 'Applications');
    const fetchBundleId = async (appRoot) => {
      const infoPlistPath = path.resolve(appRoot, 'Info.plist');
      try {
        const {stdout} = await exec('/usr/libexec/PlistBuddy', [
          '-c', 'print CFBundleIdentifier', infoPlistPath
        ]);
        return _.trim(stdout);
      } catch (ign) {
        return null;
      }
    };
    const allApps = (await fs.readdir(appsRoot))
      .filter((x) => x.endsWith('.app'))
      .map((x) => path.join(appsRoot, x));
    // @ts-ignore Typescript does not understand the below filter
    this._systemAppBundleIds = new Set(await B.all(
      allApps.map(fetchBundleId).filter(Boolean)
    ));
    return this._systemAppBundleIds;
  }

  /**
   * @override
   * @inheritdoc
   *
   * @param {string} bundleId - The bundle id of the application to be checked.
   * @return {Promise<boolean>} True if the given application is installed.
   */
  isAppInstalled = async (bundleId) => {
    try {
      const appContainer = await this.simctl.getAppContainer(bundleId);
      return appContainer.endsWith('.app') && await fs.exists(appContainer);
    } catch (ign) {
      // get_app_container subcommand fails for system applications,
      // as well as the hidden appinfo command
      return (await this._fetchSystemAppBundleIds()).has(bundleId);
    }
  };

  /**
   * @override
   * @inheritdoc
   *
   * @returns {Promise<string>}
   */
  async getLaunchDaemonsRoot () {
    const simRoot = await this.simctl.getEnv('IPHONE_SIMULATOR_ROOT');
    if (!simRoot) {
      throw new Error('The IPHONE_SIMULATOR_ROOT environment variable value cannot be retrieved');
    }

    return path.resolve(await this._getSystemRoot(), 'System/Library/LaunchDaemons');
  }
}
