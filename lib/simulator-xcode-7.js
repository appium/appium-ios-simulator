import SimulatorXcode6 from './simulator-xcode-6';

class SimulatorXcode7 extends SimulatorXcode6 {
  // at the moment there is no difference
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }
}

export default SimulatorXcode7;
