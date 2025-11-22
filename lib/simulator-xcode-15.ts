import { fs } from '@appium/support';
import { exec } from 'teen_process';
import path from 'path';
import _ from 'lodash';
import B from 'bluebird';
import { SimulatorXcode14 } from './simulator-xcode-14';

export class SimulatorXcode15 extends SimulatorXcode14 {
  private _systemAppBundleIds?: Set<string>;

  /**
   * @override
   * @inheritdoc
   *
   * @param bundleId - The bundle id of the application to be checked.
   * @return True if the given application is installed.
   */
  isAppInstalled = async (bundleId: string): Promise<boolean> => {
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
   * @returns The full path to the LaunchDaemons directory
   */
  async getLaunchDaemonsRoot(): Promise<string> {
    return path.resolve(await this._getSystemRoot(), 'System', 'Library', 'LaunchDaemons');
  }

  /**
   * Sets the increase contrast configuration for the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @param value valid increase constrast configuration value.
   *                       Acceptable value is 'enabled' or 'disabled' with Xcode 16.2.
   */
  setIncreaseContrast = async (value: string): Promise<void> => {
    await this.simctl.setIncreaseContrast(value);
  };

  /**
   * Retrieves the current increase contrast configuration value from the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @returns the contrast configuration value.
   *                            Possible return value is 'enabled', 'disabled',
   *                            'unsupported' or 'unknown' with Xcode 16.2.
   */
  getIncreaseContrast = async (): Promise<string> => await this.simctl.getIncreaseContrast();

  /**
   * Sets content size for the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @param value valid content size or action value. Acceptable value is
   *                       extra-small, small, medium, large, extra-large, extra-extra-large,
   *                       extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                       accessibility-extra-large, accessibility-extra-extra-large,
   *                       accessibility-extra-extra-extra-large with Xcode 16.2.
   */
  setContentSize = async (value: string): Promise<void> => {
    await this.simctl.setContentSize(value);
  };

  /**
   * Retrieves the current content size value from the given simulator.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 15 (but lower xcode could have this command)
   * @returns the content size value. Possible return value is
   *                            extra-small, small, medium, large, extra-large, extra-extra-large,
   *                            extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                            accessibility-extra-large, accessibility-extra-extra-large,
   *                            accessibility-extra-extra-extra-large,
   *                            unknown or unsupported with Xcode 16.2.
   */
  getContentSize = async (): Promise<string> => await this.simctl.getContentSize();

  /**
   * Retrives the full path to where the simulator system R/O volume is mounted
   *
   * @returns The full path to the system root
   */
  private async _getSystemRoot(): Promise<string> {
    const simRoot = await this.simctl.getEnv('IPHONE_SIMULATOR_ROOT');
    if (!simRoot) {
      throw new Error('The IPHONE_SIMULATOR_ROOT environment variable value cannot be retrieved');
    }
    return _.trim(simRoot);
  }

  /**
   * Collects and caches bundle indetifier of system Simulator apps
   *
   * @returns A set of system app bundle identifiers
   */
  private async _fetchSystemAppBundleIds(): Promise<Set<string>> {
    if (this._systemAppBundleIds) {
      return this._systemAppBundleIds;
    }

    const appsRoot = path.resolve(await this._getSystemRoot(), 'Applications');
    const fetchBundleId = async (appRoot: string): Promise<string | null> => {
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
    const bundleIds = await B.all(allApps.map(fetchBundleId));
    this._systemAppBundleIds = new Set(bundleIds.filter((x): x is string => x !== null));
    return this._systemAppBundleIds;
  }
}

