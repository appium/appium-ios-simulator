import type {PushNotificationPayload} from '@appium/coresim';
import type {StringRecord} from '@appium/types';

import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, HasMiscFeatures, CertificateOptions} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends HasMiscFeatures {}
}

type CoreSimulatorWithMiscFeatures = CoreSimulator & HasMiscFeatures & HasNativeSimctl;

/**
 * Perform Shake gesture on Simulator window.
 */
export async function shake(this: CoreSimulatorWithMiscFeatures): Promise<void> {
  this.log.info(`Performing shake gesture on ${this.udid} Simulator`);
  await this._native.shake(this.udid);
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
  this: CoreSimulatorWithMiscFeatures,
  payload: string,
  opts: CertificateOptions = {},
): Promise<boolean> {
  const {isRoot = true} = opts;
  // coresim treats a string argument as a file path, not content, so wrap it as a Buffer.
  const cert = Buffer.from(payload);
  if (isRoot) {
    await this._native.addRootCertificate(this.udid, cert);
  } else {
    await this._native.addCertificate(this.udid, cert);
  }
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
export async function pushNotification(this: CoreSimulatorWithMiscFeatures, payload: StringRecord): Promise<void> {
  const bundleId = payload['Simulator Target Bundle'];
  if (typeof bundleId !== 'string') {
    throw new Error(`The push notification payload must contain a 'Simulator Target Bundle' string value`);
  }
  await this._native.pushNotification(this.udid, bundleId, payload as unknown as PushNotificationPayload);
}

/**
 * Adds one or more photo/video files to the Simulator's Photos library. Each file's type is
 * auto-detected.
 *
 * @param filePaths Paths to the media files on the local filesystem.
 */
export async function addMedia(this: CoreSimulatorWithMiscFeatures, filePaths: string[]): Promise<void> {
  await this._native.addMedia(this.udid, filePaths);
}
