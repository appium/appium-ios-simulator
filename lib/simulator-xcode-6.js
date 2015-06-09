import path from 'path';

class SimulatorXcode6 {

  constructor (xcodeVersion) {
    this.xcodeVersion = xcodeVersion;
  }

  getRootDir () {
    let home = process.env.HOME;

    return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
  }

}

export {SimulatorXcode6};
