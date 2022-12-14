import log from '../logger';

const extensions = {};

/**
 * Perform Shake gesture on Simulator window.
 */
extensions.shake = async function shake () {
  log.info(`Performing shake gesture on ${this.udid} Simulator`);
  await this.simctl.spawnProcess([
    'notifyutil',
    '-p', 'com.apple.UIKit.SimulatorShake'
  ]);
};

/**
 * Adds the given certificate into the Trusted Root Store on the simulator.
 * The simulator must be shut down in order for this method to work properly.
 *
 * @param {string} payload the content of the PEM certificate
 * @returns {boolean} `true` if the certificate has been successfully installed
 * or `false` if it has already been there
 */
// eslint-disable-next-line require-await
extensions.addCertificate = async function addCertificate () {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old add certificates`);
};

/**
 * Simulates push notification delivery
 *
 * @since Xcode SDK 11.4
 */
// eslint-disable-next-line require-await
extensions.pushNotification = async function pushNotification (/* payload */) {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to push notifications`);
};

export default extensions;
