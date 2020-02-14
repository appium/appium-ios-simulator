import _ from 'lodash';
import log from './logger';
import SimulatorXcode11 from './simulator-xcode-11';


const NATIVE_SIMCTL_PERMISSIONS = [
  'all',
  'calendar',
  'contacts-limited',
  'contacts',
  'location',
  'location-always',
  'photos-add',
  'photos',
  'media-library',
  'microphone',
  'motion',
  'reminders',
  'siri',
];


class SimulatorXcode11_4 extends SimulatorXcode11 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
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
   * Sets the permissions for the particular application bundle.
   *
   * @param {string} bundleId - Application bundle identifier.
   * @param {Object} permissionsMapping - A mapping where kays
   * are service names and values are their corresponding status values.
   * The following keys are supported:
   * - all: Apply the action to all services.
   * - calendar: Allow access to calendar.
   * - contacts-limited: Allow access to basic contact info.
   * - contacts: Allow access to full contact details.
   * - location: Allow access to location services when app is in use.
   * - location-always: Allow access to location services at all times.
   * - photos-add: Allow adding photos to the photo library.
   * - photos: Allow full access to the photo library.
   * - media-library: Allow access to the media library.
   * - microphone: Allow access to audio input.
   * - motion: Allow access to motion and fitness data.
   * - reminders: Allow access to reminders.
   * - siri: Allow use of the app with Siri.
   * The following values are supported:
   * - yes: To grant the permission
   * - no: To revoke the permission
   * - unset: To reset the permission
   * @throws {Error} If there was an error while changing permissions.
   */
  async setPermissions (bundleId, permissionsMapping) {
    log.debug(`Setting access for '${bundleId}': ` +
      JSON.stringify(permissionsMapping, null, 2));
    const nonNativePerms = {};
    for (let [permName, access] of _.toPairs(permissionsMapping)) {
      if (!NATIVE_SIMCTL_PERMISSIONS.includes(permName)) {
        nonNativePerms[permName] = access;
        continue;
      }

      access = _.toLower(access);
      if (permName === 'medialibrary') {
        permName = 'media-library';
      } else if (permName === 'location' && access === 'always') {
        permName = 'location-always';
      }
      switch (access) {
        case 'yes':
        case 'inuse':
        case 'always':
          await this.simctl.grantPermission(bundleId, permName);
          break;
        case 'no':
        case 'never':
          await this.simctl.revokePermission(bundleId, permName);
          break;
        case 'unset':
          await this.simctl.resetPermission(bundleId, permName);
          break;
        default:
          throw new Error(`Unknown access value: ${access}`);
      }
    }
    if (!_.isEmpty(nonNativePerms)) {
      log.info(`The following permissions have not been recognized as native: ` +
        JSON.stringify(permissionsMapping, null, 2));
      await super.setPermissions(bundleId, nonNativePerms);
    }
  }

  /**
   * @override
   */
  async clearKeychains () {
    await this.simctl.resetKeychain();
  }
}

export default SimulatorXcode11_4;
