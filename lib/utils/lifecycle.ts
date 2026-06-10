import {log} from '../logger';
import {exec, type ExecError} from 'teen_process';
import {waitForCondition} from 'asyncbox';
import {getVersion} from 'appium-xcode';
import {
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  MIN_DEVICE_HUB_XCODE_VERSION,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
} from './constants';
import {getDevices} from './get-devices';
import {getMacAppPidByBundleId, killMacAppByBundleId} from './process';

const DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS = 60000;

/**
 * @param timeout - Timeout in milliseconds (default: DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS).
 * @returns Promise that resolves when all simulators are killed.
 */
export async function killAllSimulators(
  timeout: number = DEFAULT_SIM_SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
  const uiClientBundleId =
    xcodeVersion.major >= MIN_DEVICE_HUB_XCODE_VERSION
      ? DEVICE_HUB_UI_CLIENT_BUNDLE_ID
      : SIMULATOR_UI_CLIENT_BUNDLE_ID;

  const startedMs = performance.now();
  try {
    await exec('xcrun', ['simctl', 'shutdown', 'all'], {timeout});
  } catch (err: unknown) {
    log.debug(
      `Failed to shutdown all simulators: ${(err as ExecError).stderr || (err as Error).message}`,
    );
  }

  const uiClientPid = await getMacAppPidByBundleId(uiClientBundleId);
  if (uiClientPid) {
    log.debug(`Killing UI client '${uiClientBundleId}' (pid ${uiClientPid})`);
    await killMacAppByBundleId(uiClientBundleId);
  } else {
    log.debug(`UI client '${uiClientBundleId}' is not running`);
  }

  try {
    await waitForCondition(allSimsAreDown, {
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
  const devices = Object.values(await getDevices()).flat();
  return devices
    .filter((sim) => !['shutdown', 'unavailable', 'disconnected'].includes(sim.state.toLowerCase()))
    .map(
      (sim) =>
        `${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${sim.state.toLowerCase()}'`,
    );
}
