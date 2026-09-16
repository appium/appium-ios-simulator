import path from 'node:path';

import type {CoreSimulator} from '../types.js';

/**
 * Retrieve the full path to the directory where Simulator stuff is located.
 *
 * @returns The path string.
 */
export function getRootDir(this: CoreSimulator): string {
  return path.resolve(process.env.HOME ?? '', 'Library', 'Developer', 'CoreSimulator', 'Devices');
}

/**
 * Retrieve the full path to the directory where Simulator applications data is located.
 *
 * @returns The path string.
 */
export function getDir(this: CoreSimulator): string {
  return path.resolve(this.getRootDir(), this.udid, 'data');
}

/**
 * Retrieve the full path to the directory where Simulator logs are stored.
 *
 * @returns The path string.
 */
export function getLogDir(this: CoreSimulator): string {
  return path.resolve(process.env.HOME ?? '', 'Library', 'Logs', 'CoreSimulator', this.udid);
}
