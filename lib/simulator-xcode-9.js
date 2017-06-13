import SimulatorXcode8 from './simulator-xcode-8';


class SimulatorXcode9 extends SimulatorXcode8 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  get startupPollCommand () {
    return {
      cmd: 'bash',
      args: [
        '-c',
        'ps axo command | grep Simulator | grep SpringBoard | grep -v bash | grep -v grep'
      ],
    };
  }
}

export default SimulatorXcode9;
