import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, JpegStream, JpegStreamOptions, SupportsScreenStreaming} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsScreenStreaming {}
}

type CoreSimulatorWithScreenStreaming = CoreSimulator & SupportsScreenStreaming & HasNativeSimctl;

/**
 * Starts polling the Simulator's display and JPEG-encoding each changed frame in real time. The
 * Simulator must be booted. Requires Xcode 26+.
 *
 * @param options `displayId`, `fps`, `quality`, `scale` — see {@link JpegStreamOptions}.
 */
export async function startJpegStream(
  this: CoreSimulatorWithScreenStreaming,
  options: JpegStreamOptions = {},
): Promise<JpegStream> {
  return await this._native.startJpegStream(this.udid, options);
}
