import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, ProcessInfo, SpawnedProcess, SpawnOptions, SupportsGuestProcessSpawn} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsGuestProcessSpawn {}
}

type CoreSimulatorWithGuestProcessSpawn = CoreSimulator & SupportsGuestProcessSpawn & HasNativeSimctl;

/**
 * Spawns a process inside the Simulator (the native equivalent of `simctl spawn`) — an escape
 * hatch for guest-side operations with no dedicated `Simulator` method, such as streaming a guest
 * log. `path` is a literal path, not resolved against the guest's `$PATH`.
 *
 * @param path Path to the executable to spawn inside the Simulator.
 * @param options `arguments`/`environment` for the spawned process.
 */
export async function spawnProcess(
  this: CoreSimulatorWithGuestProcessSpawn,
  path: string,
  options: SpawnOptions = {},
): Promise<SpawnedProcess> {
  return await this._native.spawnProcess(this.udid, path, options);
}

/**
 * Lists processes that are currently running on the given Simulator.
 * The simulator must be in running state in order for this
 * method to work properly.
 *
 * @returns The list of retrieved process information.
 * @throws {Error} If no process information could be retrieved.
 */
export async function ps(this: CoreSimulatorWithGuestProcessSpawn): Promise<ProcessInfo[]> {
  return await this._native.listProcesses(this.udid);
}
