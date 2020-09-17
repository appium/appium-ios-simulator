import _ from 'lodash';
import SimulatorXcode11 from './simulator-xcode-11';

class SimulatorXcode11_4 extends SimulatorXcode11 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    // for setting the location using AppleScript, the top-level menu through which
    // the 'Location' option is found
    this._locationMenu = 'Features';
  }

  /**
   * @override
   * Sets UI appearance style.
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   * @param {string} value one of possible appearance values:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   */
  async setAppearance (value) {
    await this.simctl.setAppearance(_.toLower(value));
  }

  /**
   * @override
   * Gets the current UI appearance style
   * This function can only be called on a booted simulator.
   *
   * @since Xcode SDK 11.4
   * @returns {string} the current UI appearance style.
   * Possible values are:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   */
  async getAppearance () {
    return await this.simctl.getAppearance();
  }

  /**
   * @typedef {Object} CertificateOptions
   * @property {boolean} isRoot [true] - Whether to install the given
   * certificate into the Trusted Root store (`true`) or to the keychain
   * (`false`)
   */

  /**
   * @override
   * Adds the given certificate to the booted simulator.
   * The simulator could be in both running and shutdown states
   * in order for this method to run as expected.
   *
   * @param {string} payload the content of the PEM certificate
   * @param {CertificateOptions} opts
   */
  async addCertificate (payload, opts = {}) {
    const {
      isRoot = true,
    } = opts;
    const methodName = isRoot ? 'addRootCertificate' : 'addCertificate';
    await this.simctl[methodName](payload, {raw: true});
    return true;
  }

  /**
   * @override
   * Simulates push notification delivery to the booted simulator
   *
   * @since Xcode SDK 11.4
   * @param {Object} payload - The object that describes Apple push notification content.
   * It must contain a top-level "Simulator Target Bundle" key with a string value matching
   * the target application‘s bundle identifier and "aps" key with valid Apple Push Notification values.
   * For example:
   * {
   *   "Simulator Target Bundle": "com.apple.Preferences",
   *   "aps": {
   *     "alert": "This is a simulated notification!",
   *     "badge": 3,
   *     "sound": "default"
   *   }
   * }
   */
  async pushNotification (payload) {
    await this.simctl.pushNotification(payload);
  }

  /**
   * @override
   */
  async setPermissions (bundleId, permissionsMapping) {
    return await super.setPermissions(bundleId, permissionsMapping);

    // TODO: Switch to `simctl privacy` call after Apple
    // fixes the command (https://github.com/appium/appium/issues/14355)
    // Source PR: https://github.com/appium/appium-ios-simulator/pull/279
  }

  /**
   * @override
   */
  async clearKeychains () {
    await this.simctl.resetKeychain();
  }

  /**
   * @inheritdoc
   * @override
   * */
  async launchWindow (isUiClientRunning, opts) {
    // In xcode 11.4, UI Client must be first launched, otherwise
    // sim window stays minimized
    if (!isUiClientRunning) {
      await this.startUIClient(opts);
    }
    await this.boot();
  }

  /**
   * @inheritdoc
   * @override
   */
  async enableCalendarAccess (bundleID) {
    await this.simctl.grantPermission(bundleID, 'calendar');
  }

  /**
   * @inheritdoc
   * @override
   */
  async disableCalendarAccess (bundleID) {
    await this.simctl.revokePermission(bundleID, 'calendar');
  }


}

export default SimulatorXcode11_4;
