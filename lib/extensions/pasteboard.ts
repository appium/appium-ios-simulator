import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, SupportsPasteboard} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsPasteboard {}
}

type CoreSimulatorWithPasteboard = CoreSimulator & SupportsPasteboard & HasNativeSimctl;

/**
 * @returns The Simulator's current pasteboard content, or `""` if it holds no string content.
 */
export async function getPasteboard(this: CoreSimulatorWithPasteboard): Promise<string> {
  return await this._native.getPasteboard(this.udid);
}

/**
 * @param content String content to set as the Simulator's pasteboard content.
 */
export async function setPasteboard(this: CoreSimulatorWithPasteboard, content: string): Promise<void> {
  await this._native.setPasteboard(this.udid, content);
}
