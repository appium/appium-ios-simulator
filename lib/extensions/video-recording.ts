import type {HasNativeSimctl} from '../native/types.js';
import type {
  CoreSimulator,
  StopVideoRecordingOptions,
  SupportsScreenRecording,
  VideoRecordingOptions,
} from '../types.js';

declare module '../simulator-xcode-15.js' {
  interface SimulatorXcode15 extends SupportsScreenRecording {}
}

type CoreSimulatorWithScreenRecording = CoreSimulator & SupportsScreenRecording & HasNativeSimctl;

/**
 * Starts recording the Simulator's display (and, with `options.audio`, its audio too, muxed as a
 * second track) to `outputFile`. The Simulator must be booted. Requires Xcode 26+.
 *
 * @param outputFile Filesystem path to write the video to.
 * @param options `displayId`, `codec`, `mask`, `audio`, `fps`, `bitrate` — see {@link VideoRecordingOptions}.
 */
export async function startVideoRecording(
  this: CoreSimulatorWithScreenRecording,
  outputFile: string,
  options: VideoRecordingOptions = {},
): Promise<void> {
  await this._native.startVideoRecording(this.udid, outputFile, options);
}

/**
 * Stops a recording previously started by {@link startVideoRecording}.
 *
 * @param options `force` — see {@link StopVideoRecordingOptions}.
 */
export async function stopVideoRecording(
  this: CoreSimulatorWithScreenRecording,
  options: StopVideoRecordingOptions = {},
): Promise<void> {
  await this._native.stopVideoRecording(this.udid, options);
}

/**
 * @returns Whether a recording started by {@link startVideoRecording} is currently active.
 */
export async function isVideoRecording(this: CoreSimulatorWithScreenRecording): Promise<boolean> {
  return await this._native.isVideoRecording(this.udid);
}
