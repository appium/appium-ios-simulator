import { retryInterval } from 'asyncbox';
import B from 'bluebird';
import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';


const EXTRA_STARTUP_TIME = 5000;

class SimulatorXcode8 extends SimulatorXcode7 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  async waitForBoot () {
    // there is no reliable boot indicator in Xcode 8
    // so check the booted status through simctl
    await retryInterval(120, 500, async () => {
      let device = await this.stat();
      if (!device) throw new Error(`Unable to find simulator with udid '${this.udid}'`);
      if (device.state !== 'Booted') throw new Error(`Simulator with udid '${this.udid}' is in '${device.state}' state`);
    });

    // so sorry, but we should wait another two seconds, just to make sure we've really started
    // we can't look for another magic log line, because they seem to be app-dependent (not system dependent)
    log.debug(`Waiting an extra ${EXTRA_STARTUP_TIME}ms for the simulator to really finish booting`);
    await B.delay(EXTRA_STARTUP_TIME);
    log.debug('Done waiting extra time for simulator');
  }
}

export default SimulatorXcode8;
