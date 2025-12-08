import type { CoreSimulator, HasMiscFeatures, CertificateOptions } from '../types';
import type { StringRecord } from '@appium/types';

type CoreSimulatorWithMiscFeatures = CoreSimulator & HasMiscFeatures;

/**
 * Perform Shake gesture on Simulator window.
 */
export async function shake(this: CoreSimulatorWithMiscFeatures): Promise<void> {
  this.log.info(`Performing shake gesture on ${this.udid} Simulator`);
  await this.simctl.spawnProcess([
    'notifyutil',
    '-p', 'com.apple.UIKit.SimulatorShake'
  ]);
}

/**
 * Adds the given certificate to the booted simulator.
 * The simulator could be in both running and shutdown states
 * in order for this method to run as expected.
 *
 * @since Xcode 11.4
 * @param payload the content of the PEM certificate
 * @param opts Certificate options
 * @returns True if the certificate was added successfully.
 */
export async function addCertificate(
  this: CoreSimulatorWithMiscFeatures, payload: string, opts: CertificateOptions = {}
): Promise<boolean> {
  const {
    isRoot = true,
  } = opts;
  const methodName = isRoot ? 'addRootCertificate' : 'addCertificate';
  await this.simctl[methodName](payload, {raw: true});
  return true;
}

/**
 * Simulates push notification delivery to the booted simulator
 *
 * @since Xcode SDK 11.4
 * @param payload The object that describes Apple push notification content.
 * It must contain a top-level "Simulator Target Bundle" key with a string value matching
 * the target application's bundle identifier and "aps" key with valid Apple Push Notification values.
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
export async function pushNotification(
  this: CoreSimulatorWithMiscFeatures, payload: StringRecord
): Promise<void> {
  await this.simctl.pushNotification(payload);
}

