import SimulatorXcode8 from './simulator-xcode-8';
import { shutdown as simctlShutdown } from 'node-simctl';


class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  async shutdown () {
    await simctlShutdown(this.udid);
  }
}

export default SimulatorXcode9;
