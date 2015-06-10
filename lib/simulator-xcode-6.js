import path from 'path';

function getRootDir() {
  let home = process.env.HOME;

  return path.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
}

class SimulatorXcode6 {

  constructor (udid, xcodeVersion) {
    this.xcodeVersion = xcodeVersion;
    this.udid = udid;
  }

  getDir () {
    return path.resolve(getRootDir(), this.udid, 'data');
  }

  

}

export {SimulatorXcode6};
