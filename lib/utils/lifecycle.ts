import {log} from '../logger';
import {exec} from 'teen_process';
import {waitForCondition} from 'asyncbox';
import {getVersion} from 'appium-xcode';
import type {XcodeVersion} from 'appium-xcode';
import path from 'node:path';
import {
  DEVICE_HUB_APP_NAME,
  MIN_DEVICE_HUB_XCODE_VERSION,
  SIMULATOR_APP_NAME,
} from './constants';
import {pkill} from './process';
// it's a hack needed to stub getDevices in tests
import * as utilsModule from './index';

const DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS = 30000;

/**
 * @param timeout - Timeout in milliseconds (default: DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS).
 * @returns Promise that resolves when all simulators are killed.
 */
export async function killAllSimulators(
  timeout: number = DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
  if (typeof xcodeVersion === 'string') {
    return;
  }
  const version = xcodeVersion as XcodeVersion;
  const uiClientAppName =
    version.major >= MIN_DEVICE_HUB_XCODE_VERSION ? DEVICE_HUB_APP_NAME : SIMULATOR_APP_NAME;
  const appName = path.parse(uiClientAppName).name;

  // later versions are slower to close
  timeout = timeout * (version.major >= 8 ? 2 : 1);

  try {
    await exec('xcrun', ['simctl', 'shutdown', version.major > 8 ? 'all' : 'booted'], {timeout});
  } catch {}

  const pids: string[] = [];
  try {
    const {stdout} = await exec('pgrep', ['-f', `${appName}.app/Contents/MacOS/`]);
    if (stdout.trim()) {
      pids.push(...stdout.trim().split(/\s+/));
    }
  } catch (e: any) {
    if (e.code === 1) {
      log.debug(`${appName} is not running. Continuing...`);
      return;
    }
    if (pids.length === 0) {
      log.warn(
        `pgrep error ${e.code} while detecting whether ${appName} is running. Trying to kill anyway.`,
      );
    }
  }
  if (pids.length > 0) {
    log.debug(`Killing processes: ${pids.join(', ')}`);
    try {
      await exec('kill', ['-9', ...pids.map((pid) => `${pid}`)]);
    } catch {}
  }

  log.debug(`Using pkill to kill application: ${appName}`);
  try {
    await pkill(appName, true);
  } catch {}

  // wait for all the devices to be shutdown before Continuing
  // but only print out the failed ones when they are actually fully failed
  let remainingDevices: string[] = [];
  async function allSimsAreDown(): Promise<boolean> {
    remainingDevices = [];
    const devicesRecord = await utilsModule.getDevices();
    const devices = Object.values(devicesRecord).flat();
    return devices.every((sim: any) => {
      const state = sim.state.toLowerCase();
      const done = ['shutdown', 'unavailable', 'disconnected'].includes(state);
      if (!done) {
        remainingDevices.push(
          `${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${state}'`,
        );
      }
      return done;
    });
  }
  try {
    await waitForCondition(allSimsAreDown, {
      waitMs: timeout,
      intervalMs: 200,
    });
  } catch (err) {
    if (remainingDevices.length > 0) {
      log.warn(`The following devices are still not in the correct state after ${timeout} ms:`);
      for (const device of remainingDevices) {
        log.warn(`    ${device}`);
      }
    }
    throw err;
  }
}
