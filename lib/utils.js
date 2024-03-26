import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';
import { getVersion } from 'appium-xcode';
import path from 'path';
import { getDevices } from './device-utils';

const DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS = 30000;
export const SAFARI_STARTUP_TIMEOUT_MS = 25 * 1000;
export const MOBILE_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
export const SIMULATOR_APP_NAME = 'Simulator.app';

/**
 * @param {string} appName
 * @param {boolean} [forceKill=false]
 * @returns {Promise<number>}
 */
async function pkill (appName, forceKill = false) {
  let args = forceKill ? ['-9'] : [];
  args.push('-x', appName);
  try {
    await exec('pkill', args);
    return 0;
  } catch (err) {
    // pgrep/pkill exit codes:
    // 0       One or more processes were matched.
    // 1       No processes were matched.
    // 2       Invalid options were specified on the command line.
    // 3       An internal error occurred.
    if (!_.isUndefined(err.code)) {
      throw new Error(`Cannot forcefully terminate ${appName}. pkill error code: ${err.code}`);
    }
    log.error(`Received unexpected error while trying to kill ${appName}: ${err.message}`);
    throw err;
  }
}

/**
 * @param {number} [timeout=DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS]
 * @returns {Promise<void>}
 */
export async function killAllSimulators (timeout = DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS) {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
  if (_.isString(xcodeVersion)) {
    return;
  }
  const appName = path.parse(SIMULATOR_APP_NAME).name;

  // later versions are slower to close
  timeout = timeout * (xcodeVersion.major >= 8 ? 2 : 1);

  try {
    await exec('xcrun', ['simctl', 'shutdown', xcodeVersion.major > 8 ? 'all' : 'booted'], {timeout});
  } catch (ign) {}

  const pids = [];
  try {
    const {stdout} = await exec('pgrep', ['-f', `${appName}.app/Contents/MacOS/`]);
    if (stdout.trim()) {
      pids.push(...(stdout.trim().split(/\s+/)));
    }
  } catch (e) {
    if (e.code === 1) {
      log.debug(`${appName} is not running. Continuing...`);
      return;
    }
    if (_.isEmpty(pids)) {
      log.warn(`pgrep error ${e.code} while detecting whether ${appName} is running. Trying to kill anyway.`);
    }
  }
  if (!_.isEmpty(pids)) {
    log.debug(`Killing processes: ${pids.join(', ')}`);
    try {
      await exec('kill', ['-9', ...(pids.map((pid) => `${pid}`))]);
    } catch (ign) {}
  }

  log.debug(`Using pkill to kill application: ${appName}`);
  try {
    await pkill(appName, true);
  } catch (ign) {}

  // wait for all the devices to be shutdown before Continuing
  // but only print out the failed ones when they are actually fully failed
  let remainingDevices = [];
  async function allSimsAreDown () {
    remainingDevices = [];
    let devices = await getDevices();
    devices = _.flatten(_.values(devices));
    return _.every(devices, (sim) => {
      const state = sim.state.toLowerCase();
      const done = ['shutdown', 'unavailable', 'disconnected'].includes(state);
      if (!done) {
        remainingDevices.push(`${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${state}'`);
      }
      return done;
    });
  }
  try {
    await waitForCondition(allSimsAreDown, {
      waitMs: timeout,
      intervalMs: 200
    });
  } catch (err) {
    if (remainingDevices.length > 0) {
      log.warn(`The following devices are still not in the correct state after ${timeout} ms:`);
      for (let device of remainingDevices) {
        log.warn(`    ${device}`);
      }
    }
    throw err;
  }
}

/**
 * @param {string} udid
 * @param {{devicesSetPath?: string|null}} [opts={}]
 * @returns {Promise<any>}
 */
export async function getSimulatorInfo (udid, opts = {}) {
  const {
    devicesSetPath
  } = opts;
  // see the README for github.com/appium/node-simctl for example output of getDevices()
  const devices = _.toPairs(await getDevices({devicesSetPath}))
    .map((pair) => pair[1])
    .reduce((a, b) => a.concat(b), []);
  return _.find(devices, (sim) => sim.udid === udid);
}

/**
 * @param {string} udid
 * @returns {Promise<boolean>}
 */
export async function simExists (udid) {
  return !!(await getSimulatorInfo(udid));
}

/**
 * @returns {Promise<string>}
 */
export async function getDeveloperRoot () {
  const {stdout} = await exec('xcode-select', ['-p']);
  return stdout.trim();
}
