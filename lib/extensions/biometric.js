import _ from 'lodash';
import log from '../logger';

const extensions = {};

/**
 * Get the current state of Biometric Enrollment feature.
 *
 * @returns {Promise<boolean>} Either true or false
 * @throws {Error} If Enrollment state cannot be determined
 */
extensions.isBiometricEnrolled = async function isBiometricEnrolled () {
  const output = await this.executeUIClientScript(`
    tell application "System Events"
      tell process "Simulator"
        set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
        set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
      end tell
    end tell
  `);
  log.debug(`Touch ID enrolled state: ${output}`);
  return _.isString(output) && output.trim() === 'true';
};

/**
 * Enrolls biometric (TouchId, FaceId) feature testing in Simulator UI client.
 *
 * @param {boolean} isEnabled - Defines whether biometric state is enabled/disabled
 * @throws {Error} If the enrolled state cannot be changed
 */
extensions.enrollBiometric = async function enrollBiometric (isEnabled = true) {
  await this.executeUIClientScript(`
    tell application "System Events"
      tell process "Simulator"
        set dstMenuItem to menu item "Toggle Enrolled State" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
        set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
        if ${isEnabled ? 'not ' : ''}isChecked then
          click dstMenuItem
        end if
      end tell
    end tell
  `);
};

/**
 * Sends a notification to match/not match the touch id.
 *
 * @param {?boolean} shouldMatch [true] - Set it to true or false in order to emulate
 * matching/not matching the corresponding biometric
 */
extensions.sendBiometricMatch = async function sendBiometricMatch (shouldMatch = true) {
  await this.executeUIClientScript(`
    tell application "System Events"
      tell process "Simulator"
        set dstMenuItem to menu item "${shouldMatch ? 'Matching Touch' : 'Non-matching Touch'}" of menu 1 of menu item "Touch ID" of menu 1 of menu bar item "Hardware" of menu bar 1
        click dstMenuItem
      end tell
    end tell
  `);
};

export default extensions;
