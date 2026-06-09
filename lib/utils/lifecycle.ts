import {log} from '../logger';
import {exec} from 'teen_process';
import {waitForCondition} from 'asyncbox';
import {getVersion} from 'appium-xcode';
import {
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  MIN_DEVICE_HUB_XCODE_VERSION,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
} from './constants';
import {getDevices} from './get-devices';
import {getMacAppPidByBundleId, killMacAppByBundleId} from './process';

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
  const uiClientBundleId =
    xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION
      ? DEVICE_HUB_UI_CLIENT_BUNDLE_ID
      : SIMULATOR_UI_CLIENT_BUNDLE_ID;

  const startedMs = performance.now();
  try {
    await exec('xcrun', ['simctl', 'shutdown', 'all'], {timeout});
  } catch {}

  const uiClientPid = await getMacAppPidByBundleId(uiClientBundleId);
  if (uiClientPid) {
    log.debug(`Killing UI client '${uiClientBundleId}' (pid ${uiClientPid})`);
    await killMacAppByBundleId(uiClientBundleId);
  } else {
    log.debug(`UI client '${uiClientBundleId}' is not running. Continuing...`);
  }

  // wait for all the devices to be shutdown before Continuing
  // but only print out the failed ones when they are actually fully failed
  try {
    await waitForCondition(allSimsAreDown, {
      waitMs: Math.max(1000, startedMs + timeout - performance.now()),
      intervalMs: 200,
    });
  } catch (err) {
    const remainingDevices = await getNonShutdownDeviceDescriptions();
    if (remainingDevices.length > 0) {
      log.warn(`The following devices are still not in the correct state after ${timeout} ms:`);
      for (const device of remainingDevices) {
        log.warn(`    ${device}`);
      }
    }
    throw err;
  }
}

async function allSimsAreDown(): Promise<boolean> {
  return (await getNonShutdownDeviceDescriptions()).length === 0;
}

async function getNonShutdownDeviceDescriptions(): Promise<string[]> {
  const devicesRecord = await getDevices();
  const devices = Object.values(devicesRecord).flat();
  const descriptions: string[] = [];
  for (const sim of devices) {
    const state = sim.state.toLowerCase();
    if (!['shutdown', 'unavailable', 'disconnected'].includes(state)) {
      descriptions.push(`${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${state}'`);
    }
  }
  return descriptions;
}
