import SimulatorXcode8 from './simulator-xcode-8';
import { exec } from 'teen_process';
import log from './logger';
import { shutdown as simctlShutdown, bootDevice } from 'node-simctl';
import { waitForCondition } from 'asyncbox';


const SIMULATOR_UI_APP_PATTERN = 'Simulator\\.app';
const SIMULATOR_SHUTDOWN_TIMEOUT = 15 * 1000;

class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  async run (startupTimeout = this.startupTimeout, opts = {}) {
    opts = Object.assign({
      isHeadless: false,
    }, opts);
    if (!opts.isHeadless) {
      return await super.run(startupTimeout, opts);
    }
    log.info(`Booting the Simulator with UDID ${this.udid} in headless mode. All UI-related capabilities are going to be ignored.`);
    const startTime = process.hrtime();
    let wasUIClientKilled = false;
    try {
      await exec('pkill', ['-f', SIMULATOR_UI_APP_PATTERN]);
      wasUIClientKilled = true;
    } catch (ign) {
      // ignore error
    }
    if (wasUIClientKilled) {
      // Stopping the UI client also kills all running servers. Sad but true
      log.info(`Detected the UI client is running and killed it. Verifying the Simulator is in Shutdown state...`);
      await waitForCondition(async () => {
        const {state} = await this.stat();
        return state === 'Shutdown';
      }, {waitMs: SIMULATOR_SHUTDOWN_TIMEOUT, intervalMs: 500});
    }
    try {
      await bootDevice(this.udid);
    } catch (err) {
      // The device might be already booted, so we don't throw here
      // and let the further boot detection to do the job
      log.warn(`'xcrun simctl boot ${this.udid}' command has returned non-zero return code. The problem was: ${err.stderr}`);
    }
    await this.waitForBoot(startupTimeout);
    log.info(`Simulator booted in ${process.hrtime(startTime)[0]} seconds`);
  }

  async shutdown () {
    await simctlShutdown(this.udid);
  }
}

export default SimulatorXcode9;
