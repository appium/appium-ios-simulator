import _ from 'lodash';
import { generateDefaultsCommandArgs } from '../defaults-utils';
import B from 'bluebird';

const extensions = {};

/**
 * Updates Reduce Motion setting state.
 *
 * @param {boolean} reduceMotion Whether to enable or disable the setting.
 */
extensions.setReduceMotion = async function setReduceMotion (reduceMotion) {
  return await this.updateSettings('com.apple.Accessibility', {
    ReduceMotionEnabled: Number(reduceMotion)
  });
};

/**
 * Updates Reduce Transparency setting state.
 *
 * @param {boolean} reduceTransparency Whether to enable or disable the setting.
 */
extensions.setReduceTransparency = async function setReduceTransparency (reduceTransparency) {
  return await this.updateSettings('com.apple.Accessibility', {
    EnhancedBackgroundContrastEnabled: Number(reduceTransparency)
  });
};

/**
 * Allows to update Simulator preferences in runtime.
 *
 * @param {string} domain The name of preferences domain to be updated,
 * for example, 'com.apple.Preferences' or 'com.apple.Accessibility' or
 * full path to a plist file on the local file system.
 * @param {object} updates Mapping of keys/values to be updated
 * @returns {boolean} True if settings were actually changed
 */
extensions.updateSettings = async function updateSettings (domain, updates) {
  if (_.isEmpty(updates)) {
    return false;
  }

  const argChunks = generateDefaultsCommandArgs(updates);
  await B.all(argChunks.map((args) => this.simctl.spawnProcess([
    'defaults', 'write', domain, ...args
  ])));
  return true;
};

/**
 * Sets UI appearance style.
 * This function can only be called on a booted simulator.
 *
 * @since Xcode SDK 11.4
 */
extensions.setAppearance = async function setAppearance (/* value */) { // eslint-disable-line require-await
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to set UI appearance`);
};

/**
 * Gets the current UI appearance style
 * This function can only be called on a booted simulator.
 *
 * @since Xcode SDK 11.4
 */
extensions.getAppearance = async function getAppearance () { // eslint-disable-line require-await
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to get UI appearance`);
};

// eslint-disable-next-line require-await
extensions.configureLocalization = async function configureLocalization () {
  throw new Error(`Xcode SDK '${this.xcodeVersion}' is too old to configure the Simulator locale`);
};

export default extensions;
