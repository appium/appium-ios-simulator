import type {EventEmitter} from 'node:events';
import type {Socket} from 'node:net';

import type {AppiumLogger, StringRecord} from '@appium/types';
import type {XcodeVersion} from 'appium-xcode';

export interface SimulatorInfoOptions {
  devicesSetPath?: string | null;
}

export interface CreateSimulatorOptions extends SimulatorInfoOptions {
  /** The name of the simulator platform, iOS by default */
  platform?: string;
}

export interface SimulatorListEntry {
  udid: string;
  name: string;
  /** Lowercase, e.g. `'booted'`, `'shutdown'`, `'booting'`, `'shutting down'`, `'creating'`. */
  state: string;
  /** e.g. `'17.4'` — derived from `runtimeIdentifier`; `''` if it couldn't be parsed. */
  sdk: string;
  /** e.g. `'iOS'` — derived from `runtimeIdentifier`; `''` if it couldn't be parsed. */
  platform: string;
  deviceTypeIdentifier: string;
  runtimeIdentifier: string;
}

// Declared locally (structurally identical to `@appium/coresim`'s own types of the same name)
// rather than imported from there, so this package's public API surface doesn't tie a consumer's
// type-checking to `@appium/coresim`'s exact exports — only to this package's own `types.js`.

export interface SpawnOptions {
  /** Fully replaces argv, including argv[0] — `path` only selects the executable. */
  arguments?: string[];
  /** Merged additively into the spawned process's environment. */
  environment?: Record<string, string>;
}

/** A process spawned inside the Simulator via {@link SupportsGuestProcessSpawn.spawnProcess}. */
export interface SpawnedProcess extends EventEmitter {
  readonly pid: number;
  /** Streams the process's live stdout as it runs. */
  readonly stdout: Socket;
  /** Streams the process's live stderr as it runs. */
  readonly stderr: Socket;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  /** Whether the process has neither exited nor been killed yet. */
  readonly running: boolean;
  /**
   * Sends a signal to the process. A no-op returning `false` once exit has already been observed,
   * rather than risking an error on an already-reaped pid.
   */
  kill(signal?: NodeJS.Signals | number): boolean;
}

/** Options for {@link SupportsScreenshot.getScreenshot}. */
export interface ScreenshotOptions {
  /** Image encoding — defaults to `'png'`. */
  format?: 'png' | 'jpeg';
  /**
   * Which display to capture, by id. Defaults to the primary display (falling back to the first
   * renderable display if none is primary, e.g. tvOS).
   */
  displayId?: string;
  /**
   * JPEG quality as a percentage (0 = smallest/most compressed, 100 = largest/least compressed).
   * Only meaningful with `format: 'jpeg'`. Defaults to near-lossless when omitted.
   */
  quality?: number;
}

export interface ProcessInfo {
  /**
   * The actual process identifier.
   * Could be zero if the process is the system one.
   */
  pid: number;
  /**
   * The process group identifier.
   * This could be `null` if the process is not a part of the
   * particular group. For `normal` application processes the group
   * name usually equals to `UIKitApplication`.
   */
  group: string | null;
  /**
   * The process name, for example `com.apple.Preferences`
   */
  name: string;
}

export interface DevicePreferences {
  /** TBD. Example value: 2.114 */
  SimulatorExternalDisplay?: number;
  /** TBD. Example value: '' */
  ChromeTint?: string;
  /** Scale value for the particular Simulator window. 1.0 means 100% scale. */
  SimulatorWindowLastScale?: number;
  /** Simulator window orientation. Possible values are: 'Portrait', 'LandscapeLeft', 'PortraitUpsideDown' and 'LandscapeRight'. */
  SimulatorWindowOrientation?: string;
  /**
   * Window rotation angle. This value is expected to be in sync
   * with _SimulatorWindowOrientation_. The corresponding values are:
   * 0, 90, 180 and 270.
   */
  SimulatorWindowRotationAngle?: number;
  /**
   * The coordinates of Simulator's window center in pixels, for example '{-1294.5, 775.5}'.
   */
  SimulatorWindowCenter?: string;
  /** Equals to 1 if hardware keyboard should be connected. Otherwise 0. */
  ConnectHardwareKeyboard?: boolean;
}

export interface CommonPreferences {
  /** Whether to connect hardware keyboard */
  ConnectHardwareKeyboard?: boolean;
}

export interface StartUiClientOptions {
  /**
   * Defines the window scale value for the UI client window for the current Simulator.
   * Equals to null by default, which keeps the current scale unchanged.
   * It should be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   */
  scaleFactor?: string;
  /**
   * Number of milliseconds to wait until Simulator booting
   * process is completed. The default timeout of 60000 ms will be used if not set explicitly.
   */
  startupTimeout?: number;
}

export interface RunOptions extends StartUiClientOptions {
  /**
   * Whether to connect the hardware keyboard to the
   * Simulator UI client. Equals to `false` by default.
   */
  connectHardwareKeyboard?: boolean;
  /**
   * Whether to start the Simulator in headless mode (with UI
   * client invisible). `false` by default.
   */
  isHeadless?: boolean;
  /**
   * Whether to highlight touches on Simulator
   * screen. This is helpful while debugging automated tests or while observing the automation
   * recordings. `false` by default.
   */
  tracePointer?: boolean;
  /**
   * Whether to disable pasteboard sync with the
   * Simulator UI client or respect the system wide preference. 'on', 'off', or 'system' is available.
   * The sync increases launching simulator process time, but it allows system to sync pasteboard
   * with simulators. Follows system-wide preference if the value is 'system'.
   * Defaults to 'off'.
   */
  pasteboardAutomaticSync?: string;
  /**
   * Preferences of the newly created Simulator device
   */
  devicePreferences?: DevicePreferences;
}

export interface ShutdownOptions {
  /**
   * The number of milliseconds to wait until
   * Simulator is shut down completely. No wait happens if the timeout value is not set
   */
  timeout?: number | string;
}

export interface KillUiClientOptions {
  /** Process id of the UI Simulator window */
  pid?: number | string | null;
  /** POSIX signal number to send via `kill` instead of the default Apple Event quit */
  signal?: number | string;
}

export interface DeviceStat {
  /** Simulator name, for example 'iPhone 10' */
  name: string;
  /** Device UDID, for example 'C09B34E5-7DCB-442E-B79C-AB6BC0357417' */
  udid: string;
  /** For example 'Booted' or 'Shutdown' */
  state: string;
  /** For example '12.4' */
  sdk: string;
}

export interface CoreSimulator extends EventEmitter {
  _keychainsBackupPath: string | null | undefined;
  _webInspectorSocket: string | null | undefined;
  _platformVersion: string | null | undefined;
  _uiClientAppPath: Promise<string> | undefined;
  _systemAppBundleIds: Set<string> | undefined;

  get keychainPath(): string;
  get udid(): string;
  get xcodeVersion(): XcodeVersion;

  set devicesSetPath(value: string | null);
  get devicesSetPath(): string | null;

  get startupTimeout(): number;
  get uiClientBundleId(): string;

  get log(): AppiumLogger;

  getUIClientPid(): Promise<string | null>;
  isUIClientRunning(): Promise<boolean>;
  getPlatformVersion(): Promise<string>;
  getRootDir(): string;
  getDir(): string;
  getLogDir(): string;
  stat(): Promise<DeviceStat | StringRecord<never>>;
  isFresh(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  isShutdown(): Promise<boolean>;
  boot(): Promise<void>;
  launchWindow(isUiClientRunning: boolean, opts?: RunOptions): Promise<void>;
  startUIClient(opts?: StartUiClientOptions): Promise<void>;
  run(opts?: RunOptions): Promise<void>;
  clean(): Promise<void>;
  shutdown(opts?: ShutdownOptions): Promise<void>;
  delete(): Promise<void>;
  ps(): Promise<ProcessInfo[]>;
  killUIClient(opts?: KillUiClientOptions): Promise<boolean>;
  waitForBoot(startupTimeout: number): Promise<void>;
  getLaunchDaemonsRoot(): Promise<string>;
}

export interface LaunchAppOptions {
  /**
   * Whether to wait until the app has fully started and
   * is present in processes list. `false` by default.
   */
  wait?: boolean;
  /**
   * The number of milliseconds to wait until
   * the app is fully started. Only applicatble if `wait` is true. 10000 ms by default.
   */
  timeoutMs?: number;
  /** Environment variables to set for the launched app's process. */
  environment?: StringRecord;
  /** Whether to terminate an already-running instance of the app before launching it. */
  terminateExisting?: boolean;
}

/** Which of an app's on-disk containers {@link InteractsWithApps.getAppContainer} should resolve. */
export type AppContainerType = 'app' | 'data' | 'groups' | string;

export interface InteractsWithApps {
  installApp(app: string): Promise<void>;
  getUserInstalledBundleIdsByBundleName(bundleName: string): Promise<string[]>;
  isAppInstalled(bundleId: string): Promise<boolean>;
  removeApp(bundleId: string): Promise<void>;
  launchApp(bundleId: string, opts?: LaunchAppOptions): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  isAppRunning(bundleId: string): Promise<boolean>;
  scrubApp(bundleId: string): Promise<void>;
  /**
   * Resolves the full filesystem path to one of an installed app's on-disk containers.
   *
   * @param bundleId Bundle identifier of the installed app.
   * @param containerType `'app'` (the default) for the `.app` bundle itself, `'data'` for its
   * data container, `'groups'` for its sole App Group container (if it has exactly one), or any
   * other string naming a specific App Group identifier.
   */
  getAppContainer(bundleId: string, containerType?: AppContainerType): Promise<string>;
  /**
   * @param bundleId Bundle identifier of the installed app.
   * @returns The app's properties, as reported by CoreSimulator's own `propertiesOfApplication:`.
   */
  appInfo(bundleId: string): Promise<Record<string, unknown>>;
}

export interface SupportsBiometric {
  isBiometricEnrolled(): Promise<boolean>;
  enrollBiometric(isEnabled: boolean): Promise<void>;
  sendBiometricMatch(shouldMatch: boolean, biometricName: string): Promise<void>;
}

export interface SupportsGeolocation {
  setGeolocation(latitude: string | number, longitude: string | number): Promise<boolean>;
}

export interface InteractsWithKeychain {
  backupKeychains(): Promise<boolean>;
  restoreKeychains(excludePatterns: string[]): Promise<boolean>;
  clearKeychains(): Promise<void>;
}

export interface SupportsAppPermissions {
  setPermission(bundleId: string, permission: string, value: string): Promise<void>;
  setPermissions(bundleId: string, permissionsMapping: StringRecord): Promise<void>;
  getPermission(bundleId: string, serviceName: string): Promise<string>;
}

export interface InteractsWithSafariBrowser {
  openUrl(url: string): Promise<void>;
  scrubSafari(keepPrefs?: boolean): Promise<void>;
  updateSafariSettings(updates: StringRecord): Promise<boolean>;
  getWebInspectorSocket(): Promise<string | null>;
}

export interface LanguageOptions {
  /** The name of the language, for example `de` or `zh-Hant-CN` */
  name: string;
  /**
   * No Simulator services will be reset if this option is set to true.
   * See https://github.com/appium/appium/issues/19440 for more details
   */
  skipSyncUiDialogTranslation?: boolean;
}

export interface LocaleOptions {
  /** The name of the system locale, for example `de_CH` or `zh_CN` */
  name: string;
  /** Optional calendar format, for example `gregorian` or `persian` */
  calendar?: string;
}

export interface LocalizationOptions {
  keyboard?: KeyboardOptions;
  language?: LanguageOptions;
  locale?: LocaleOptions;
}

export interface HasSettings {
  setReduceMotion(reduceMotion: boolean): Promise<boolean>;
  setReduceTransparency(reduceTransparency: boolean): Promise<boolean>;
  updateSettings(domain: string, updates: StringRecord): Promise<boolean>;
  setAppearance(value: string): Promise<void>;
  getAppearance(): Promise<string>;
  setContentSize(value: string): Promise<void>;
  getContentSize(): Promise<string>;
  setIncreaseContrast(value: string): Promise<void>;
  getIncreaseContrast(): Promise<string>;
  disableKeyboardIntroduction(): Promise<boolean>;
  configureLocalization(opts?: LocalizationOptions): Promise<boolean>;
  setAutoFillPasswords(isEnabled: boolean): Promise<boolean>;
}

export interface CertificateOptions {
  /**
   * Whether to install the given
   * certificate into the Trusted Root store (`true`, the default value) or to the keychain (`false`)
   */
  isRoot?: boolean;
}

export interface HasMiscFeatures {
  shake(): Promise<void>;
  addCertificate(payload: string, opts?: CertificateOptions): Promise<boolean>;
  pushNotification(payload: StringRecord): Promise<void>;
  /**
   * Adds one or more photo/video files to the Simulator's Photos library. Each file's type is
   * auto-detected.
   *
   * @param filePaths Paths to the media files on the local filesystem.
   */
  addMedia(filePaths: string[]): Promise<void>;
}

export interface SupportsPasteboard {
  /** @returns The Simulator's current pasteboard content, or `""` if it holds no string content. */
  getPasteboard(): Promise<string>;
  /** @param content String content to set as the Simulator's pasteboard content. */
  setPasteboard(content: string): Promise<void>;
}

export interface SupportsScreenshot {
  /**
   * Captures the Simulator's display. The Simulator must be booted.
   *
   * @param options `format` (defaults to `'png'`), `displayId` (defaults to the primary
   * display), and `quality` (JPEG only, 0-100).
   */
  getScreenshot(options?: ScreenshotOptions): Promise<Buffer>;
}

/** Options for {@link SupportsScreenRecording.startVideoRecording}. Requires Xcode 26+. */
export interface VideoRecordingOptions {
  /**
   * Which display to record, by id. Defaults to the primary display (falling back to the first
   * renderable display if none is primary, e.g. tvOS).
   */
  displayId?: string;
  /** Video codec — `'h264'` (default) or `'hevc'`. */
  codec?: 'h264' | 'hevc';
  /**
   * For a non-rectangular display (e.g. a Dynamic Island cutout): `'ignored'` (default) saves the
   * unmasked framebuffer, `'black'` renders the mask black, `'alpha'` is not supported and behaves
   * like `'black'`. Only applies when neither `audio` nor `fps` is set — see their doc comments.
   */
  mask?: 'ignored' | 'alpha' | 'black';
  /**
   * Also capture the device's audio into the same file, muxed as a second track. Defaults to
   * `false`. Requires macOS 14.2+ (Core Audio process taps), the host's "System Audio Recording
   * Only" privacy permission (System Settings > Privacy & Security — cannot be granted
   * programmatically; a denial isn't a thrown error, it surfaces as a silent, audio-less/near-
   * silent recording), a default audio output device on the host, and a booted device that has
   * produced audio at least once.
   *
   * Like an explicit `fps`, this switches the implementation away from CoreSimulator's own private
   * recorder (which can't mux audio) to `@appium/coresim`'s own encoders — that switch costs
   * `mask` support, which only the private recorder implements.
   */
  audio?: boolean;
  /**
   * Max frames/sec to poll the framebuffer at — see {@link VideoStreamOptions.fps} for identical
   * semantics. Meaningless against CoreSimulator's private recorder (it captures on its own
   * cadence, not one that's polled), so setting `fps` — even without `audio` — switches this
   * recording to the same own-encoder implementation `audio` does.
   */
  fps?: number;
  /** Target average bitrate, in bits/sec. Respected on either implementation. */
  bitrate?: number;
}

/** Options for {@link SupportsScreenRecording.stopVideoRecording}. */
export interface StopVideoRecordingOptions {
  /**
   * Best-effort: still attempts the native stop, but releases this device's tracked-active-
   * recording bookkeeping regardless of whether that attempt succeeds, instead of leaving it
   * retryable. Useful for a best-effort teardown path that must not throw and has no other way to
   * release a recording it can't otherwise stop cleanly — understand that this can leave a native
   * resource dangling if the stop genuinely never lands.
   */
  force?: boolean;
}

export interface SupportsScreenRecording {
  /**
   * Starts recording the Simulator's display (and, with `options.audio`, its audio too, muxed as
   * a second track) to `outputFile`. The Simulator must be booted. Resolves once the first frame
   * has actually been recorded, so it's always safe to call {@link stopVideoRecording} immediately
   * after. Only one recording may be active per device at a time; starting a second one while the
   * first is still running rejects. Requires Xcode 26+.
   *
   * @param outputFile Filesystem path to write the video to.
   * @param options `displayId`, `codec`, `mask`, `audio`, `fps`, `bitrate` — see {@link VideoRecordingOptions}.
   * @throws {Error} if a recording is already in progress for this device.
   */
  startVideoRecording(outputFile: string, options?: VideoRecordingOptions): Promise<void>;
  /**
   * Stops a recording previously started by {@link startVideoRecording} on the same device.
   * Resolves once the video file has been finalized on disk and is safe to read.
   *
   * @param options `force` — see {@link StopVideoRecordingOptions}.
   * @throws {Error} if no recording is currently in progress for this device.
   */
  stopVideoRecording(options?: StopVideoRecordingOptions): Promise<void>;
  /** @returns Whether a recording started by {@link startVideoRecording} is currently active. */
  isVideoRecording(): Promise<boolean>;
}

/** Options for {@link SupportsScreenStreaming.startVideoStream}. Requires Xcode 26+. */
export interface VideoStreamOptions {
  /**
   * Which display to stream, by id. Defaults to the primary display (falling back to the first
   * renderable display if none is primary, e.g. tvOS).
   */
  displayId?: string;
  /** Video codec — `'h264'` (default) or `'hevc'`. */
  codec?: 'h264' | 'hevc';
  /**
   * Max frames/sec to poll the framebuffer at — an unchanged frame is never re-encoded, so this is
   * an upper bound, not a guarantee. Must be >= 1. Defaults to 60.
   */
  fps?: number;
  /** Target average bitrate, in bits/sec. Defaults to 4,000,000 (4 Mbps). */
  bitrate?: number;
  /**
   * Also stream the device's audio, interleaved into the same `accessUnits()` sequence. Defaults
   * to `false`. Same requirements and failure modes as {@link VideoRecordingOptions.audio}.
   */
  audio?: boolean;
}

/** Options for {@link SupportsScreenStreaming.startJpegStream}. Requires Xcode 26+. */
export interface JpegStreamOptions {
  /**
   * Which display to stream, by id. Defaults to the primary display (falling back to the first
   * renderable display if none is primary, e.g. tvOS).
   */
  displayId?: string;
  /**
   * Max frames/sec to poll the framebuffer at — an unchanged frame is never re-encoded, so this is
   * an upper bound, not a guarantee. Must be >= 1. Defaults to 60.
   */
  fps?: number;
  /**
   * JPEG quality as a percentage (0 = smallest/most compressed, 100 = largest/least compressed).
   * Defaults to 80 — noticeably smaller than {@link ScreenshotOptions.quality}'s own (near-
   * lossless) default, more suitable for a continuous live stream than a one-off screenshot.
   */
  quality?: number;
  /**
   * Frame scale as a percentage of the original display resolution — 100 (default) performs no
   * scaling; must be greater than 0 and no greater than 100.
   */
  scale?: number;
}

/**
 * One JPEG-encoded frame from {@link JpegStream.frames}. Unlike {@link VideoAccessUnit}, every
 * frame is independently decodable — there's no keyframe/interframe distinction — so consumers
 * (e.g. an MJPEG multipart HTTP stream built from this sequence) can start from, or drop, any
 * frame freely.
 */
export interface JpegFrame {
  data: Buffer;
  /** Monotonically increasing, starting at 0. */
  sequence: number;
  /** Microseconds since the stream started. */
  timestampMicros: number;
}

/**
 * A live JPEG frame stream from {@link SupportsScreenStreaming.startJpegStream} — polls the
 * Simulator's display and delivers each changed frame as a standalone JPEG image, at a
 * configurable fps/quality. Unlike {@link VideoStream}, this produces no video codec bitstream —
 * it's meant for callers that want to build their own MJPEG (`multipart/x-mixed-replace`) HTTP
 * stream, or otherwise just want a plain sequence of images, out of `frames()` themselves.
 */
export interface JpegStream extends EventEmitter {
  /**
   * Yields each JPEG frame as it's produced, until {@link stop} is called or the stream errors (in
   * which case the error is thrown out of the loop). Pass `signal` to stop iterating without
   * treating that as an error.
   *
   * Only one active consumer is supported at a time — a second concurrent call rejects rather
   * than silently sharing (and corrupting) the first one's single internal waiter slot.
   */
  frames(signal?: AbortSignal): AsyncGenerator<JpegFrame>;
  /** Stops the stream and releases the underlying encoder. Idempotent, including concurrently. */
  stop(): Promise<void>;
}

/**
 * One encoded unit from {@link VideoStream.accessUnits}, discriminated by `track`: a video unit
 * (Annex-B NAL units — a keyframe's `data` has parameter sets, SPS/PPS or VPS/SPS/PPS for HEVC,
 * prepended, so it's self-decodable alone) or, when {@link VideoStreamOptions.audio} was set, an
 * interleaved audio unit (an ADTS-framed AAC-LC packet — always independently decodable, so
 * `isKeyFrame` is always `true`). Without `audio`, every unit has `track: 'video'`.
 */
export interface VideoAccessUnit {
  track: 'video' | 'audio';
  data: Buffer;
  isKeyFrame: boolean;
  /** Monotonically increasing per track, starting at 0 — independent between `'video'` and `'audio'`. */
  sequence: number;
  /** Microseconds since the stream started, on one shared clock across both tracks. */
  timestampMicros: number;
}

/**
 * A live video stream from {@link SupportsScreenStreaming.startVideoStream} — encodes the
 * Simulator's display (and, with `options.audio`, its audio too) in real time via
 * VideoToolbox/Core Audio, unlike {@link SupportsScreenRecording.startVideoRecording}, which
 * drives CoreSimulator's own private, file-only recorder.
 */
export interface VideoStream extends EventEmitter {
  readonly codec: 'h264' | 'hevc';
  /**
   * Yields each encoded access unit as it's produced, until {@link stop} is called or the stream
   * errors (in which case the error is thrown out of the loop). Pass `signal` to stop iterating
   * without treating that as an error.
   *
   * Only one active consumer is supported at a time — a second concurrent call rejects rather
   * than silently sharing (and corrupting) the first one's single internal waiter slot.
   */
  accessUnits(signal?: AbortSignal): AsyncGenerator<VideoAccessUnit>;
  /** Stops the stream and releases the underlying encoder. Idempotent, including concurrently. */
  stop(): Promise<void>;
}

export interface SupportsScreenStreaming {
  /**
   * Starts encoding the Simulator's display (and, with `options.audio`, its audio) in real time.
   * The Simulator must be booted. Resolves once the encoder(s) have actually started; the returned
   * {@link VideoStream}'s `accessUnits()` then yields each unit as it arrives. Independent of
   * `startVideoRecording`/`stopVideoRecording` — both, and any number of concurrent streams, can
   * run on the same device at once. Requires Xcode 26+.
   *
   * @param options `displayId`, `codec`, `fps`, `bitrate`, `audio` — see {@link VideoStreamOptions}.
   */
  startVideoStream(options?: VideoStreamOptions): Promise<VideoStream>;
  /**
   * Starts polling the Simulator's display and JPEG-encoding each changed frame in real time. The
   * Simulator must be booted. Resolves once the encoder has actually started; the returned
   * {@link JpegStream}'s `frames()` then yields each frame as it arrives. Independent of
   * `startVideoStream`/`startVideoRecording` — any number of concurrent streams/recordings can run
   * on the same device at once. Requires Xcode 26+.
   *
   * @param options `displayId`, `fps`, `quality`, `scale` — see {@link JpegStreamOptions}.
   */
  startJpegStream(options?: JpegStreamOptions): Promise<JpegStream>;
}

export interface SupportsGuestProcessSpawn {
  /**
   * Spawns a process inside the Simulator (the native equivalent of `simctl spawn`) — an escape
   * hatch for guest-side operations with no dedicated `Simulator` method, such as streaming a
   * guest log. `path` is resolved against the Simulator's own runtime root and confined there —
   * it cannot be used to spawn an arbitrary host executable, and a `path` that would resolve
   * outside the runtime (e.g. via `..`) throws.
   *
   * @param path Path to the executable, relative to the Simulator runtime root (e.g. `/usr/bin/log`).
   * @param options `arguments`/`environment` for the spawned process.
   */
  spawnProcess(path: string, options?: SpawnOptions): Promise<SpawnedProcess>;
}

export interface SimulatorLookupOptions {
  /** The name of the simulator platform, iOS by default */
  platform?: string;
  /** Set it to `false` in order to skip simulator existence verification. `true` by default */
  checkExistence?: boolean;
  /**
   * The full path to the devices set where
   * the current simulator is located. `null` value means that the default path is
   * used, which is usually `~/Library/Developer/CoreSimulator/Devices`
   */
  devicesSetPath?: string | null;
  /** The logger to use for the simulator class. A default logger will be created if not provided */
  logger?: AppiumLogger;
}

export type Simulator = CoreSimulator &
  InteractsWithSafariBrowser &
  InteractsWithApps &
  HasSettings &
  InteractsWithApps &
  SupportsBiometric &
  SupportsGeolocation &
  InteractsWithKeychain &
  SupportsAppPermissions &
  HasMiscFeatures &
  SupportsPasteboard &
  SupportsScreenshot &
  SupportsScreenRecording &
  SupportsScreenStreaming &
  SupportsGuestProcessSpawn;

interface KeyboardOptions {
  /** The name of the keyboard locale, for example `en_US` or `de_CH` */
  name: string;
  /** The keyboard layout, for example `QUERTY` or `Ukrainian` */
  layout: string;
  /** hardware Could either be `Automatic` or `null` */
  hardware?: string | null;
}
