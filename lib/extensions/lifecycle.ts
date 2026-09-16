import path from 'node:path';

import {SimDeviceState} from '@appium/coresim';
import {fs} from '@appium/support';
import type {StringRecord} from '@appium/types';
import {waitForCondition, retryInterval} from 'asyncbox';

import {toDeviceListEntry} from '../native/device-info.js';
import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, DeviceStat, ShutdownOptions} from '../types.js';

// `CoreSimulator`'s methods are actually split across several extensions/*.ts files
// (paths.ts, lifecycle.ts, ui-client.ts, system-root.ts, process.ts) and mixed onto
// SimulatorXcode15's prototype via Object.assign — declared here (just once; TypeScript merges
// every `declare module` augmentation targeting the same file into one shape) so the class's
// `implements CoreSimulator` sees them despite none being defined directly in its body.
declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends CoreSimulator {}
}

type CoreSimulatorWithLifecycle = CoreSimulator & HasNativeSimctl;

/**
 * Get the state and specifics of this simulator.
 *
 * @returns Simulator stats mapping, for example:
 * { name: 'iPhone 4s',
 *   udid: 'C09B34E5-7DCB-442E-B79C-AB6BC0357417',
 *   state: 'Shutdown',
 *   sdk: '8.3'
 * }
 */
export async function stat(this: CoreSimulatorWithLifecycle): Promise<DeviceStat | StringRecord<never>> {
  const devices = await this._native.getDevices();
  const device = devices.find((d) => d.udid === this.udid);
  if (!device) {
    return {};
  }
  const {name, udid, state, sdk} = toDeviceListEntry(device);
  return {name, udid, state, sdk};
}

/**
 * Check if the Simulator has been booted at least once
 * and has not been erased before.
 *
 * @returns True if the current Simulator has never been started before.
 */
export async function isFresh(this: CoreSimulatorWithLifecycle): Promise<boolean> {
  const cachesRoot = path.resolve(this.getDir(), 'Library', 'Caches');
  return (await fs.exists(cachesRoot)) ? (await fs.glob('*', {cwd: cachesRoot})).length === 0 : true;
}

async function deviceState(this: CoreSimulatorWithLifecycle): Promise<SimDeviceState | undefined> {
  const devices = await this._native.getDevices();
  return devices.find((d) => d.udid === this.udid)?.state;
}

/**
 * Retrieves the state of the current Simulator. One should distinguish the
 * states of Simulator UI and the Simulator itself.
 *
 * @returns True if the current Simulator is running.
 */
export async function isRunning(this: CoreSimulatorWithLifecycle): Promise<boolean> {
  return (await deviceState.call(this)) === SimDeviceState.Booted;
}

/**
 * Checks if the simulator is in shutdown state.
 * This method is necessary, because Simulator might also be
 * in the transitional Shutting Down state right after the `shutdown`
 * command has been issued.
 *
 * @returns True if the current Simulator is shut down.
 */
export async function isShutdown(this: CoreSimulatorWithLifecycle): Promise<boolean> {
  return (await deviceState.call(this)) === SimDeviceState.Shutdown;
}

/**
 * Get the platform version of the current Simulator.
 *
 * @returns SDK version, for example '18.3'.
 */
export async function getPlatformVersion(this: CoreSimulatorWithLifecycle): Promise<string> {
  if (!this._platformVersion) {
    const deviceStat = await this.stat();
    this._platformVersion = 'sdk' in deviceStat ? deviceStat.sdk : '';
  }
  return this._platformVersion as string;
}

/**
 * Boots Simulator if not already booted.
 * Does nothing if it is already running.
 * This API does NOT wait until Simulator is fully booted.
 *
 * @throws {Error} If there was a failure while booting the Simulator.
 */
export async function boot(this: CoreSimulatorWithLifecycle): Promise<void> {
  if (await this.isRunning()) {
    return;
  }
  try {
    await this._native.bootDevice(this.udid, {});
  } catch (e) {
    // Tolerate a race where the device already left 'Shutdown' by the time we got here.
    if ((await deviceState.call(this)) === SimDeviceState.Shutdown) {
      throw e;
    }
    return;
  }
  // The state transition out of 'Shutdown' can lag bootDevice()'s own resolution — wait for it so
  // callers requiring Booting/Booted (e.g. waitForBoot()) don't race it.
  await waitForCondition(async () => (await deviceState.call(this)) !== SimDeviceState.Shutdown, {
    waitMs: 10000,
    intervalMs: 100,
  });
}

/**
 * Verify whether the Simulator booting is completed and/or wait for it
 * until the timeout expires.
 *
 * @param startupTimeout - The number of milliseconds to wait until booting is completed.
 */
export async function waitForBoot(this: CoreSimulatorWithLifecycle, startupTimeout: number): Promise<void> {
  await this._native.waitForBoot(this.udid, {timeoutMs: startupTimeout});
}

/**
 * Reset the current Simulator to the clean state.
 * It is expected the simulator is in shutdown state when this API is called.
 */
export async function clean(this: CoreSimulatorWithLifecycle): Promise<void> {
  this.log.info(`Cleaning simulator ${this.udid}`);
  await this._native.eraseDevice(this.udid);
}

/**
 * Delete the particular Simulator from devices list.
 */
export async function deleteDevice(this: CoreSimulatorWithLifecycle): Promise<void> {
  await this._native.deleteDevice(this.udid);
}

/**
 * Shut down the current Simulator.
 *
 * @param opts - Shutdown options including timeout.
 * @throws {Error} If Simulator fails to transition into Shutdown state after
 * the given timeout.
 */
export async function shutdown(this: CoreSimulatorWithLifecycle, opts: ShutdownOptions = {}): Promise<void> {
  if (await this.isShutdown()) {
    return;
  }

  try {
    await retryInterval(5, 500, () => this._native.shutdownDevice(this.udid));
  } catch (e) {
    // Tolerate a race where the device transitioned to Shutdown between the check above and here.
    if (!(await this.isShutdown())) {
      throw e;
    }
  }
  const waitMs = parseInt(`${opts.timeout ?? 0}`, 10);
  if (waitMs > 0) {
    try {
      await waitForCondition(async () => await this.isShutdown(), {
        waitMs,
        intervalMs: 100,
      });
    } catch {
      throw new Error(`Simulator is not in 'Shutdown' state after ${waitMs}ms`);
    }
  }
}
