import path from 'node:path';

import {getSystemRoot} from '../native/system-root.js';
import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator} from '../types.js';

type CoreSimulatorWithSystemRoot = CoreSimulator & HasNativeSimctl;

/**
 * @returns The full path to the LaunchDaemons directory.
 */
export async function getLaunchDaemonsRoot(this: CoreSimulatorWithSystemRoot): Promise<string> {
  return path.resolve(await getSystemRoot(this._native, this.udid), 'System', 'Library', 'LaunchDaemons');
}
