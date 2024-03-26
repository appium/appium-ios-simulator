/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * @this {CoreSimulatorWithMiscFeatures}
 * Perform Shake gesture on Simulator window.
 */
export async function shake () {
  this.log.info(`Performing shake gesture on ${this.udid} Simulator`);
  await this.simctl.spawnProcess([
    'notifyutil',
    '-p', 'com.apple.UIKit.SimulatorShake'
  ]);
}

/**
 * Adds the given certificate into the Trusted Root Store on the simulator.
 * The simulator must be shut down in order for this method to work properly.
 *
 * @this {CoreSimulatorWithMiscFeatures}
 * @param {string} payload the content of the PEM certificate
 * @param {import('../types').CertificateOptions} [opts={}]
 * @returns {Promise<boolean>} `true` if the certificate has been successfully installed
 * or `false` if it has already been there
 */
// eslint-disable-next-line require-await
export async function addCertificate (payload, opts = {}) {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old add certificates`);
}

/**
 * Simulates push notification delivery
 *
 * @this {CoreSimulatorWithMiscFeatures}
 * @param {import('@appium/types').StringRecord} payload
 * @returns {Promise<void>}
 * @since Xcode SDK 11.4
 */
// eslint-disable-next-line require-await
export async function pushNotification (payload) {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to push notifications`);
}

/**
 * @typedef {import('../types').CoreSimulator & import('../types').HasMiscFeatures} CoreSimulatorWithMiscFeatures
 */
