import path from 'path';
import SimulatorXcode7 from './simulator-xcode-7';

class SimulatorXcode8 extends SimulatorXcode7 {

  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  getLogDir () {
    let home = process.env.HOME;
    return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices', this.udid, 'data', 'Library', 'Logs');
  }


}

export default SimulatorXcode8;
