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
 * Adds the given certificate into the Trusted Root Store on the simulator.
 * The simulator must be shut down in order for this method to work properly.
 *
 * @param payload the content of the PEM certificate
 * @param opts Certificate options
 * @returns `true` if the certificate has been successfully installed
 * or `false` if it has already been there
 */
export async function addCertificate(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  this: CoreSimulatorWithMiscFeatures, _payload: string, _opts: CertificateOptions = {}
): Promise<boolean> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old add certificates`);
}

/**
 * Simulates push notification delivery
 *
 * @param _payload Push notification payload
 * @since Xcode SDK 11.4
 */
export async function pushNotification(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  this: CoreSimulatorWithMiscFeatures, _payload: StringRecord
): Promise<void> {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to push notifications`);
}

