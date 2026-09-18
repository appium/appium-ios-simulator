import type {BiometricName} from '@appium/coresim';

import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, SupportsBiometric} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsBiometric {}
}

type CoreSimulatorWithBiometric = CoreSimulator & SupportsBiometric & HasNativeSimctl;

/**
 * @returns Promise that resolves to true if biometric is enrolled
 */
export async function isBiometricEnrolled(this: CoreSimulatorWithBiometric): Promise<boolean> {
  const isEnrolled = await this._native.isBiometricEnrolled(this.udid);
  this.log.info(`Current biometric enrolled state for ${this.udid} Simulator: ${isEnrolled}`);
  return isEnrolled;
}

/**
 * @param isEnabled Whether to enable biometric enrollment
 */
export async function enrollBiometric(this: CoreSimulatorWithBiometric, isEnabled: boolean = true): Promise<void> {
  this.log.debug(
    `Setting biometric enrolled state for ${this.udid} Simulator to '${isEnabled ? 'enabled' : 'disabled'}'`,
  );
  await this._native.enrollBiometric(this.udid, isEnabled);
}

/**
 * Sends a notification to match/not match the particular biometric.
 *
 * @param shouldMatch Set it to true or false in order to emulate
 * matching/not matching the corresponding biometric
 * @param biometricName Either touchId or faceId (faceId is only available since iOS 11)
 */
export async function sendBiometricMatch(
  this: CoreSimulatorWithBiometric,
  shouldMatch: boolean = true,
  biometricName: string = 'touchId',
): Promise<void> {
  await this._native.sendBiometricMatch(this.udid, shouldMatch, biometricName as BiometricName);
  this.log.info(
    `Sent notification to ${shouldMatch ? 'match' : 'not match'} ${biometricName} biometric ` +
      `for ${this.udid} Simulator`,
  );
}
