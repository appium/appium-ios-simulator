import type {HasNativeSimctl} from '../native/types.js';
import {orientationToRaw, rawToOrientation} from '../native/ui-mappings.js';
import type {CoreSimulator, DeviceOrientation, SupportsOrientation} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsOrientation {}
}

type CoreSimulatorWithOrientation = CoreSimulator & SupportsOrientation & HasNativeSimctl;

/**
 * Rotates the device. This function can only be called on a booted simulator.
 *
 * @param orientation `'portrait'`, `'portrait-upside-down'`, `'landscape-left'` or `'landscape-right'`.
 */
export async function setOrientation(
  this: CoreSimulatorWithOrientation,
  orientation: DeviceOrientation,
): Promise<void> {
  await this._native.setOrientation(this.udid, orientationToRaw(orientation));
}

/**
 * Retrieves the device's current orientation. This function can only be called on a booted simulator.
 *
 * @returns `'portrait'`, `'portrait-upside-down'`, `'landscape-left'` or `'landscape-right'`.
 */
export async function getOrientation(this: CoreSimulatorWithOrientation): Promise<DeviceOrientation> {
  return rawToOrientation(await this._native.getOrientation(this.udid)) as DeviceOrientation;
}
