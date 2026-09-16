import {getVersion} from 'appium-xcode';
import {retryInterval, waitForCondition} from 'asyncbox';

import {log} from '../logger.js';
import {createNativeSimctl} from '../native/native-simctl.js';
import {
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  MIN_DEVICE_HUB_XCODE_VERSION,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
} from './constants.js';
import {getDevices} from './get-devices.js';
import {getMacAppPidByPath, killMacAppByPath} from './process.js';
import {getUiClientAppPath} from './xcode.js';

const DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS = 60000;

/**
 * @param timeout - Timeout in milliseconds (default: DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS).
 * @returns Promise that resolves when all simulators are killed.
 */
export async function killAllSimulators(timeout: number = DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS): Promise<void> {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
  const uiClientBundleId =
    xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION ? DEVICE_HUB_UI_CLIENT_BUNDLE_ID : SIMULATOR_UI_CLIENT_BUNDLE_ID;
  const uiClientApp = await getUiClientAppPath(uiClientBundleId, xcodeVersion);

  const startedMs = performance.now();
  try {
    // @appium/coresim's underlying `xcode-select -p` call has been observed to occasionally not
    // respond within its own hardcoded timeout on hosted CI runners — retry rather than give up
    // on the whole shutdown for what's usually a one-off transient hiccup.
    await retryInterval(3, 1000, () => createNativeSimctl().shutdownAllDevices());
  } catch (err: unknown) {
    log.debug(`Failed to shutdown all simulators: ${(err as Error).message}`);
  }

  const uiClientPid = await getMacAppPidByPath(uiClientApp);
  if (uiClientPid) {
    log.debug(`Killing UI client '${uiClientBundleId}' (pid ${uiClientPid})`);
    await killMacAppByPath(uiClientApp);
  } else {
    log.debug(`UI client '${uiClientBundleId}' is not running`);
  }

  try {
    await waitForCondition(async () => (await allSimsAreDown()) && (await getMacAppPidByPath(uiClientApp)) === null, {
      waitMs: Math.max(1000, startedMs + timeout - performance.now()),
      intervalMs: 200,
    });
  } catch (err) {
    const remainingDevices = await getNonShutdownDeviceDescriptions();
    const message =
      remainingDevices.length > 0
        ? `The following devices are still not in the correct state after ${timeout} ms:\n` +
          remainingDevices.map((device) => `    ${device}`).join('\n')
        : `Timed out after ${timeout} ms waiting for all simulators to shut down`;
    throw new Error(message, {cause: err});
  }
}

async function allSimsAreDown(): Promise<boolean> {
  try {
    return (await getNonShutdownDeviceDescriptions()).length === 0;
  } catch {
    return false;
  }
}

async function getNonShutdownDeviceDescriptions(): Promise<string[]> {
  const devices = await getDevices();
  return devices
    .filter((sim) => sim.state !== 'Shutdown')
    .map((sim) => `${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${sim.state}'`);
}
