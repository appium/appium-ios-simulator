import _ from 'lodash';
import type { CoreSimulator, SupportsBiometric } from '../types';

type CoreSimulatorWithBiometric = CoreSimulator & SupportsBiometric;

const ENROLLMENT_NOTIFICATION_RECEIVER = 'com.apple.BiometricKit.enrollmentChanged';
const BIOMETRICS: Record<string, string> = {
  touchId: 'fingerTouch',
  faceId: 'pearl',
};

/**
 * @returns Promise that resolves to true if biometric is enrolled
 */
export async function isBiometricEnrolled(this: CoreSimulatorWithBiometric): Promise<boolean> {
  const {stdout} = await this.simctl.spawnProcess([
    'notifyutil',
    '-g', ENROLLMENT_NOTIFICATION_RECEIVER
  ]);
  const match = (new RegExp(`${_.escapeRegExp(ENROLLMENT_NOTIFICATION_RECEIVER)}\\s+([01])`))
    .exec(stdout);
  if (!match) {
    throw new Error(`Cannot parse biometric enrollment state from '${stdout}'`);
  }
  this.log.info(`Current biometric enrolled state for ${this.udid} Simulator: ${match[1]}`);
  return match[1] === '1';
}

/**
 * @param isEnabled Whether to enable biometric enrollment
 */
export async function enrollBiometric(this: CoreSimulatorWithBiometric, isEnabled: boolean = true): Promise<void> {
  this.log.debug(`Setting biometric enrolled state for ${this.udid} Simulator to '${isEnabled ? 'enabled' : 'disabled'}'`);
  await this.simctl.spawnProcess([
    'notifyutil',
    '-s', ENROLLMENT_NOTIFICATION_RECEIVER, isEnabled ? '1' : '0'
  ]);
  await this.simctl.spawnProcess([
    'notifyutil',
    '-p', ENROLLMENT_NOTIFICATION_RECEIVER
  ]);
  if (await this.isBiometricEnrolled() !== isEnabled) {
    throw new Error(`Cannot set biometric enrolled state for ${this.udid} Simulator to '${isEnabled ? 'enabled' : 'disabled'}'`);
  }
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
  biometricName: string = 'touchId'
): Promise<void> {
  const domainComponent = toBiometricDomainComponent(biometricName);
  const domain = `com.apple.BiometricKit_Sim.${domainComponent}.${shouldMatch ? '' : 'no'}match`;
  await this.simctl.spawnProcess([
    'notifyutil',
    '-p', domain
  ]);
  this.log.info(
    `Sent notification ${domain} to ${shouldMatch ? 'match' : 'not match'} ${biometricName} biometric ` +
    `for ${this.udid} Simulator`
  );
}

/**
 * @param name Biometric name (touchId or faceId)
 * @returns Domain component string
 */
export function toBiometricDomainComponent(name: string): string {
  if (!BIOMETRICS[name]) {
    throw new Error(`'${name}' is not a valid biometric. Use one of: ${JSON.stringify(_.keys(BIOMETRICS))}`);
  }
  return BIOMETRICS[name];
}

