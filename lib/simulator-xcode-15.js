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
      } catch {
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
    } catch {
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

  /**
   * Sets the increase contrast configuration for the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @param {string} value valid increase constrast configuration value.
   *                       Acceptable value is 'enabled' or 'disabled' with Xcode 16.2.
   * @returns {Promise<void>}
   */
  setIncreaseContrast = async (value) => {
    await this.simctl.setIncreaseContrast(value);
  };

  /**
   * Retrieves the current increase contrast configuration value from the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @returns {Promise<string>} the contrast configuration value.
   *                            Possible return value is 'enabled', 'disabled',
   *                            'unsupported' or 'unknown' with Xcode 16.2.
   */
  getIncreaseContrast = async () => await this.simctl.getIncreaseContrast();

  /**
   * Sets content size for the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @param {string} value valid content size or action value. Acceptable value is
   *                       extra-small, small, medium, large, extra-large, extra-extra-large,
   *                       extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                       accessibility-extra-large, accessibility-extra-extra-large,
   *                       accessibility-extra-extra-extra-large with Xcode 16.2.
   * @returns {Promise<void>}
   */
  setContentSize = async (value) => {
    await this.simctl.setContentSize(value);
  };

  /**
   * Retrieves the current content size value from the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @returns {Promise<string>} the content size value. Possible return value is
   *                            extra-small, small, medium, large, extra-large, extra-extra-large,
   *                            extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                            accessibility-extra-large, accessibility-extra-extra-large,
   *                            accessibility-extra-extra-extra-large,
   *                            unknown or unsupported with Xcode 16.2.
   */
  getContentSize = async () => await this.simctl.getContentSize();
}
