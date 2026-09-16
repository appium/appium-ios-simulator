import type {ScreenshotOptions} from '@appium/coresim';

import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, SupportsScreenshot} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsScreenshot {}
}

type CoreSimulatorWithScreenshot = CoreSimulator & SupportsScreenshot & HasNativeSimctl;

/**
 * Captures the Simulator's display. The Simulator must be booted.
 *
 * @param options `format` (defaults to `'png'`), `displayId` (defaults to the primary display),
 * and `quality` (JPEG only, 0-100).
 */
export async function getScreenshot(
  this: CoreSimulatorWithScreenshot,
  options: ScreenshotOptions = {},
): Promise<Buffer> {
  return await this._native.getScreenshot(this.udid, options);
}
