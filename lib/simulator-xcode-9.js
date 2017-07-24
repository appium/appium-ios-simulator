import SimulatorXcode8 from './simulator-xcode-8';
import { exec } from 'teen_process';
import log from './logger';
import { shutdown as simctlShutdown, bootDevice } from 'node-simctl';
import { waitForCondition } from 'asyncbox';
import { restoreTouchEnrollShortcuts, backupTouchEnrollShortcuts,
         setTouchEnrollKey } from './touch-enroll.js';


const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;

class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  async run (opts = {}) {
    opts = Object.assign({
      isHeadless: false,
      allowTouchEnroll: false,
      startupTimeout: this.startupTimeout,
    }, opts);
    const {state} = await this.stat();
    const isServerRunning = state === 'Booted';
    const isUIClientRunning = await this.isUIClientRunning();
    const startTime = process.hrtime();
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
    if (opts.isHeadless) {
      if (isServerRunning && !isUIClientRunning) {
        log.info(`Simulator with UDID ${this.udid} already booted in headless mode.`);
        return;
      }
      log.info(`Booting the Simulator with UDID ${this.udid} in headless mode. All UI-related capabilities are going to be ignored.`);
      let wasUIClientKilled = false;
      try {
        await exec('pkill', ['-x', this.simulatorApp.split('.')[0]]);
        wasUIClientKilled = true;
      } catch (ign) {
        // ignore error
      }
      if (wasUIClientKilled) {
        // Stopping the UI client also kills all running servers. Sad but true
        log.info(`Detected the UI client was running and killed it. Verifying the Simulator is in Shutdown state...`);
        await waitForShutdown();
      }
      await bootSimulator();
    } else {
      if (isServerRunning && isUIClientRunning) {
        log.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);
        return;
      }
      if (['Shutdown', 'Booted'].indexOf(state) === -1) {
        log.info(`Simulator ${this.udid} is in '${state}' state. Trying to shutdown...`);
        try {
          await this.shutdown();
        } catch (err) {
          log.warn(`Error on Simulator shutdown: ${err.message}`);
        }
        await waitForShutdown();
      }
      // Set the 'Touch ID Enroll' key bindings before the Simulator starts
      if (opts.allowTouchEnroll) {
        await setTouchEnrollKey();
      }
      if (await this.isUIClientRunning()) {
        log.info(`Booting Simulator with UDID ${this.udid} while UI client is running...`);
        await bootSimulator();
      } else {
        await this.startUIClient(opts);
      }
    }

    await this.waitForBoot(opts.startupTimeout);
    log.info(`Simulator with UDID ${this.udid} booted in ${process.hrtime(startTime)[0]} seconds`);
  }

  async shutdown () {
    await restoreTouchEnrollShortcuts();
    const {state} = await this.stat();
    if (state === 'Shutdown') {
      return;
    }
    await simctlShutdown(this.udid);
  }

  async enrollTouchID () {
    await backupTouchEnrollShortcuts();
    await super.enrollTouchID();
  }
}

export default SimulatorXcode9;
