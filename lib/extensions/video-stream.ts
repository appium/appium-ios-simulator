import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, SupportsScreenStreaming, VideoStream, VideoStreamOptions} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsScreenStreaming {}
}

type CoreSimulatorWithScreenStreaming = CoreSimulator & SupportsScreenStreaming & HasNativeSimctl;

/**
 * Starts encoding the Simulator's display (and, with `options.audio`, its audio) in real time.
 * The Simulator must be booted. Requires Xcode 26+.
 *
 * @param options `displayId`, `codec`, `fps`, `bitrate`, `audio` — see {@link VideoStreamOptions}.
 */
export async function startVideoStream(
  this: CoreSimulatorWithScreenStreaming,
  options: VideoStreamOptions = {},
): Promise<VideoStream> {
  return await this._native.startVideoStream(this.udid, options);
}
