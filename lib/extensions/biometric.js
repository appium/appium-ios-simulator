import _ from 'lodash';

const ENROLLMENT_NOTIFICATION_RECEIVER = 'com.apple.BiometricKit.enrollmentChanged';
const BIOMETRICS = {
  touchId: 'fingerTouch',
  faceId: 'pearl',
};

/**
 * @this {CoreSimulatorWithBiometric}
 * @returns {Promise<boolean>}
 */
export async function isBiometricEnrolled () {
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
 * @this {CoreSimulatorWithBiometric}
 * @param {boolean} isEnabled
 */
export async function enrollBiometric (isEnabled = true) {
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
 * @this {CoreSimulatorWithBiometric}
 * @param {boolean} shouldMatch [true] - Set it to true or false in order to emulate
 * matching/not matching the corresponding biometric
 * @param {string} biometricName [touchId] - Either touchId or faceId (faceId is only available since iOS 11)
 */
export async function sendBiometricMatch (shouldMatch = true, biometricName = 'touchId') {
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
 * @param {string} name
 * @returns {string}
 */
export function toBiometricDomainComponent (name) {
  if (!BIOMETRICS[name]) {
    throw new Error(`'${name}' is not a valid biometric. Use one of: ${JSON.stringify(_.keys(BIOMETRICS))}`);
  }
  return BIOMETRICS[name];
}

/**
 * @typedef {import('../types').CoreSimulator & import('../types').SupportsBiometric} CoreSimulatorWithBiometric
 */
