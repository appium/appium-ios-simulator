import {timing, util} from '@appium/support';
import AsyncLock from 'async-lock';
import {waitForCondition} from 'asyncbox';
import {exec} from 'teen_process';

import type {HasNativeSimctl} from '../native/types.js';
import type {CoreSimulator, HasSettings, KillUiClientOptions, RunOptions, StartUiClientOptions} from '../types.js';
import {getMacAppPidByPath, getUiClientAppPath} from '../utils/index.js';
import {compileSimulatorPreferences, updatePreferences} from './settings.js';

const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const UI_CLIENT_DISCOVERY_TIMEOUT_MS = 30 * 1000;
const STARTUP_LOCK = new AsyncLock();

type CoreSimulatorWithUiClient = CoreSimulator & HasSettings & HasNativeSimctl;

/**
 * Retrieves the current process id of the UI client.
 *
 * @returns The process ID or null if the UI client is not running.
 */
export async function getUIClientPid(this: CoreSimulatorWithUiClient): Promise<string | null> {
  const uiClientApp = await getUiClientAppPathCached.call(this);
  const pid = await getMacAppPidByPath(uiClientApp);
  if (pid) {
    this.log.debug(`Got UI client PID: ${pid}`);
  }
  return pid;
}

/**
 * Check the state of Simulator UI client.
 *
 * @returns True if UI client is running or false otherwise.
 */
export async function isUIClientRunning(this: CoreSimulatorWithUiClient): Promise<boolean> {
  return (await this.getUIClientPid()) !== null;
}

async function getUiClientAppPathCached(this: CoreSimulatorWithUiClient): Promise<string> {
  if (!this._uiClientAppPath) {
    this._uiClientAppPath = getUiClientAppPath(this.uiClientBundleId, this.xcodeVersion);
  }
  return this._uiClientAppPath;
}

/**
 * Start the Simulator UI client with the given arguments.
 *
 * @param opts - Simulator startup options.
 */
export async function startUIClient(this: CoreSimulatorWithUiClient, opts: StartUiClientOptions = {}): Promise<void> {
  const startUiOpts = {
    startupTimeout: this.startupTimeout,
    ...opts,
  };

  const uiClientApp = await getUiClientAppPathCached.call(this);
  const args = ['-Fn', uiClientApp];
  this.log.info(`Starting UI client: ${util.quote(['open', ...args])}`);
  try {
    await exec('open', args, {timeout: startUiOpts.startupTimeout});
  } catch (err: any) {
    throw new Error(`Got an unexpected error while opening UI client: ${err.stderr || err.stdout || err.message}`, {
      cause: err,
    });
  }

  // `open` only schedules the launch; give the app a head start to actually appear before
  // returning, but never block booting the device on it.
  try {
    await waitForCondition(async () => (await this.getUIClientPid()) !== null, {
      waitMs: UI_CLIENT_DISCOVERY_TIMEOUT_MS,
      intervalMs: 300,
    });
  } catch {
    this.log.warn(
      `UI client '${this.uiClientBundleId}' did not become discoverable within ${UI_CLIENT_DISCOVERY_TIMEOUT_MS}ms`,
    );
  }
}

/**
 * Boots simulator and opens simulators UI Client if not already opened.
 * In xcode 11.4, UI Client must be first launched, otherwise
 * sim window stays minimized
 *
 * @param isUiClientRunning - whether the simulator UI client is already running.
 * @param opts - arguments to start simulator UI client with.
 */
export async function launchWindow(
  this: CoreSimulatorWithUiClient,
  isUiClientRunning: boolean,
  opts: RunOptions = {},
): Promise<void> {
  // In xcode 11.4, UI Client must be first launched, otherwise
  // sim window stays minimized
  if (!isUiClientRunning) {
    await this.startUIClient(opts);
  }
  await this.boot();
}

/**
 * Kill the UI client if it is running.
 *
 * With no explicit `signal`, quits via an Apple Event instead of a POSIX signal — Xcode 27+'s
 * DeviceHub.app ignores SIGINT/SIGTERM.
 *
 * @param opts - Options including process ID and signal number.
 * @returns True if the UI client was successfully killed or false
 *                   if it is not running.
 * @throws {Error} If killing/quitting the client process fails.
 */
export async function killUIClient(this: CoreSimulatorWithUiClient, opts: KillUiClientOptions = {}): Promise<boolean> {
  const {pid, signal} = opts;
  const clientPid = pid || (await this.getUIClientPid());
  if (!clientPid) {
    return false;
  }

  if (signal) {
    this.log.debug(`Sending ${signal} kill signal to Simulator UI client with PID ${clientPid}`);
    try {
      await exec('kill', [`-${signal}`, `${clientPid}`]);
      return true;
    } catch (e: any) {
      if (e.code === 1) {
        return false;
      }
      throw new Error(`Cannot kill the Simulator UI client. Original error: ${e.message}`, {
        cause: e,
      });
    }
  }

  this.log.debug(`Quitting Simulator UI client '${this.uiClientBundleId}' (pid ${clientPid})`);
  try {
    await exec('osascript', ['-e', `tell application id "${this.uiClientBundleId}" to quit`]);
    return true;
  } catch (e: any) {
    throw new Error(`Cannot quit the Simulator UI client. Original error: ${e.stderr || e.message}`, {
      cause: e,
    });
  }
}

/**
 * Executes given Simulator with options. The Simulator will not be restarted if
 * it is already running and the current UI state matches to `isHeadless` option.
 *
 * @param opts - One or more of available Simulator options.
 */
export async function run(this: CoreSimulatorWithUiClient, opts: RunOptions = {}): Promise<void> {
  const runOpts: RunOptions = {
    isHeadless: false,
    startupTimeout: this.startupTimeout,
    ...structuredClone(opts),
  };

  const [devicePreferences, commonPreferences] = compileSimulatorPreferences.bind(this)(runOpts);
  await updatePreferences.bind(this)(devicePreferences, commonPreferences);

  const timer = new timing.Timer().start();
  const shouldWaitForBoot = await STARTUP_LOCK.acquire(this.uiClientBundleId, async () => {
    const isServerRunning = await this.isRunning();
    const uiClientPid = await this.getUIClientPid();
    if (runOpts.isHeadless) {
      if (isServerRunning && !uiClientPid) {
        this.log.info(`Simulator with UDID '${this.udid}' is already booted in headless mode.`);
        return false;
      }
      if (await this.killUIClient({pid: uiClientPid})) {
        this.log.info(
          `Detected the Simulator UI client was running and killed it. Verifying the current Simulator state`,
        );
      }
      try {
        // Stopping the UI client kills all running servers for some early XCode versions. This is a known bug
        await waitForCondition(async () => await this.isShutdown(), {
          waitMs: 5000,
          intervalMs: 100,
        });
      } catch {
        if (!(await this.isRunning())) {
          throw new Error(`Simulator with UDID '${this.udid}' cannot be transitioned to headless mode`);
        }
        return false;
      }
      this.log.info(
        `Booting Simulator with UDID '${this.udid}' in headless mode. ` +
          `All UI-related capabilities are going to be ignored`,
      );
      await this.boot();
    } else {
      if (isServerRunning && uiClientPid) {
        this.log.info(`Both Simulator with UDID '${this.udid}' and the UI client are currently running`);
        return false;
      }
      if (isServerRunning) {
        this.log.info(
          `Simulator '${this.udid}' is booted while its UI is not visible. ` +
            `Trying to restart it with the Simulator window visible`,
        );
        await this.shutdown({timeout: SIMULATOR_SHUTDOWN_TIMEOUT});
      }
      await this.launchWindow(Boolean(uiClientPid), runOpts);
    }
    return true;
  });

  if (shouldWaitForBoot && runOpts.startupTimeout) {
    await this.waitForBoot(runOpts.startupTimeout);
    this.log.info(`Simulator with UDID ${this.udid} booted in ${timer.getDuration().asSeconds.toFixed(3)}s`);
  }

  void (async () => {
    try {
      await this.disableKeyboardIntroduction();
    } catch (e: any) {
      this.log.info(`Cannot disable Simulator keyboard introduction. Original error: ${e.message}`);
    }
  })();
}
