import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';
import { getVersion } from 'appium-xcode';
import Simctl from 'node-simctl';
import path from 'path';


const DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS = 30000;
const SAFARI_STARTUP_TIMEOUT_MS = 25 * 1000;
const MOBILE_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const SIMULATOR_APP_NAME = 'Simulator.app';
const APP_ACTIVATION_SCRIPT = (pid) => `
use framework "Foundation"
use framework "AppKit"
use scripting additions

set theApp to current application's NSRunningApplication's runningApplicationWithProcessIdentifier:${pid}
if theApp = null then
	log "Cannot find Simulator window under PID ${pid}. Is it running?"
	error number 1
end if
set result to theApp's activateWithOptions:3
if not result then
	log "Cannot activate Simulator window under PID ${pid}. Is it running?"
	error number 1
end if
`;


const BIOMETRICS = {
  touchId: 'fingerTouch',
  faceId: 'pearl',
};

function toBiometricDomainComponent (name) {
  if (!BIOMETRICS[name]) {
    throw new Error(`'${name}' is not a valid biometric. Use one of: ${JSON.stringify(_.keys(BIOMETRICS))}`);
  }
  return BIOMETRICS[name];
}

// pgrep/pkill exit codes:
// 0       One or more processes were matched.
// 1       No processes were matched.
// 2       Invalid options were specified on the command line.
// 3       An internal error occurred.
async function pkill (appName, forceKill = false) {
  let args = forceKill ? ['-9'] : [];
  args.push('-x', appName);
  try {
    await exec('pkill', args);
    return 0;
  } catch (err) {
    if (!_.isUndefined(err.code)) {
      throw new Error(`Cannot forcefully terminate ${appName}. pkill error code: ${err.code}`);
    }
    log.error(`Received unexpected error while trying to kill ${appName}: ${err.message}`);
    throw err;
  }
}

async function killAllSimulators (timeout = DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS) {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
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
    let devices = await new Simctl().getDevices();
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

async function getSimulatorInfo (udid, opts = {}) {
  const {
    devicesSetPath
  } = opts;
  // see the README for github.com/appium/node-simctl for example output of getDevices()
  let devices = await new Simctl({
    devicesSetPath
  }).getDevices();

  devices = _.toPairs(devices)
    .map((pair) => pair[1])
    .reduce((a, b) => a.concat(b), []);
  return _.find(devices, (sim) => sim.udid === udid);
}

async function simExists (udid) {
  return !!(await getSimulatorInfo(udid));
}

async function getDeveloperRoot () {
  const {stdout} = await exec('xcode-select', ['-p']);
  return stdout.trim();
}

/**
 * Activates the app having the given process identifier.
 * See https://developer.apple.com/documentation/appkit/nsrunningapplication/1528725-activatewithoptions?language=objc
 * for more details.
 *
 * @param {number|string} pid App process identifier
 * @throws {Error} If the given PID is not running or there was a failure
 * while activating the app
 */
async function activateApp (pid) {
  try {
    await exec('osascript', ['-e', APP_ACTIVATION_SCRIPT(pid)]);
  } catch (e) {
    throw new Error(`Simulator window cannot be activated. Original error: ${e.stderr || e.message}`);
  }
}

export {
  killAllSimulators,
  simExists,
  getSimulatorInfo,
  toBiometricDomainComponent,
  getDeveloperRoot,
  activateApp,
  SAFARI_STARTUP_TIMEOUT_MS,
  MOBILE_SAFARI_BUNDLE_ID,
  SIMULATOR_APP_NAME,
};
