import SimulatorXcode8 from './simulator-xcode-8';
import AsyncLock from 'async-lock';
import log from './logger';
import { shutdown as simctlShutdown, bootDevice, eraseDevice } from 'node-simctl';
import { waitForCondition } from 'asyncbox';


const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;
const startupLock = new AsyncLock();

class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  /**
   * Executes given Simulator with options. The Simulator will not be restarted if
   * it is already running and the current UI state matches to `isHeadless` option.
   * @override
   *
   * @param {object} opts - One or more of available Simulator options:
   *   - {string} scaleFactor: can be one of ['1.0', '0.75', '0.5', '0.33', '0.25'].
   *   Defines the window scale value for the UI client window for the current Simulator.
   *   Equals to null by default, which keeps the current scale unchanged.
   *   - {boolean} connectHardwareKeyboard: whether to connect the hardware keyboard to the
   *   Simulator UI client. Equals to false by default.
   *   - {number} startupTimeout: number of milliseconds to wait until Simulator booting
   *   process is completed. The default timeout will be used if not set explicitly.
   *   - {boolean} isHeadless: whether to start the Simulator in headless mode (with UI
   *   client invisible). `false` by default.
   */
  async run (opts = {}) {
    opts = Object.assign({
      isHeadless: false,
      startupTimeout: this.startupTimeout,
    }, opts);
    const bootSimulator = async () => {
      try {
        await bootDevice(this.udid);
      } catch (err) {
        log.warn(`'xcrun simctl boot ${this.udid}' command has returned non-zero code. The problem was: ${err.stderr}`);
      }
    };
    const waitForShutdown = async () => {
      await waitForCondition(async () => {
        const {state} = await this.stat();
        return state === 'Shutdown';
      }, {waitMs: SIMULATOR_SHUTDOWN_TIMEOUT, intervalMs: 500});
    };
    let shouldWaitForBoot = true;
    const startTime = process.hrtime();
    await startupLock.acquire(this.uiClientBundleId, async () => {
      const stat = await this.stat();
      const serverState = stat.state;
      const isServerRunning = serverState === 'Booted';
      const isUIClientRunning = await this.isUIClientRunning();
      if (opts.isHeadless) {
        if (isServerRunning && !isUIClientRunning) {
          log.info(`Simulator with UDID ${this.udid} already booted in headless mode.`);
          shouldWaitForBoot = false;
          return;
        }
        if (await this.killUIClient()) {
          // Stopping the UI client also kills all running servers. Sad but true
          log.info(`Detected the UI client was running and killed it. Verifying the Simulator is in Shutdown state...`);
          await waitForShutdown();
        }
        log.info(`Booting Simulator with UDID ${this.udid} in headless mode. All UI-related capabilities are going to be ignored.`);
        await bootSimulator();
      } else {
        if (isServerRunning && isUIClientRunning) {
          log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
          shouldWaitForBoot = false;
          return;
        }
        if (['Shutdown', 'Booted'].indexOf(serverState) === -1) {
          log.info(`Simulator ${this.udid} is in '${serverState}' state. Trying to shutdown...`);
          try {
            await this.shutdown();
          } catch (err) {
            log.warn(`Error on Simulator shutdown: ${err.message}`);
          }
          await waitForShutdown();
        }
        log.info(`Booting Simulator with UDID ${this.udid}...`);
        await bootSimulator();
        if (!isUIClientRunning) {
          await this.startUIClient(opts);
        }
      }
    });

    if (shouldWaitForBoot) {
      await this.waitForBoot(opts.startupTimeout);
      log.info(`Simulator with UDID ${this.udid} booted in ${process.hrtime(startTime)[0]} seconds`);
    }
  }

  /**
   * Shut down the current Simulator.
   * @override
   */
  async shutdown () {
    const {state} = await this.stat();
    if (state === 'Shutdown') {
      return;
    }
    await simctlShutdown(this.udid);
  }

  /**
   * Reset the current Simulator to the clean state.
   * @override
   */
  async clean () {
    log.info(`Cleaning simulator ${this.udid}`);
    await eraseDevice(this.udid, 10000);
  }
}

export default SimulatorXcode9;
