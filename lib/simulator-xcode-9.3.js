import SimulatorXcode9 from './simulator-xcode-9';
import { exec } from 'teen_process';
import log from './logger';


class SimulatorXcode93 extends SimulatorXcode9 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    this.webInspectorSocket = null;
  }

  /*
   * @override
   */
  async getWebInspectorSocket () {
    if (this.webInspectorSocket) {
      return this.webInspectorSocket;
    }

    // lsof -aUc launchd_sim gives a set of records like
    // https://github.com/appium/appium-ios-simulator/commit/c00901a9ddea178c5581a7a57d96d8cee3f17c59#diff-2be09dd2ea01cfd6bbbd73e10bc468da782a297365eec706999fc3709c01478dR102
    // these _appear_ to always be grouped together by PID for each simulator.
    // Therefore, by obtaining simulator PID with an expected simulator UDID,
    // we can get the correct `com.apple.webinspectord_sim.socket`
    // without depending on the order of `lsof -aUc launchd_sim` result.
    const {stdout} = await exec('lsof', ['-aUc', 'launchd_sim']);
    const udidPattern = `([0-9]{1,5}).+${this.udid}`;
    const udidMatch = stdout.match(new RegExp(udidPattern));
    if (!udidMatch) {
      log.debug(`Failed to get Web Inspector socket. lsof result: ${stdout}`);
      return null;
    }

    const pidPattern = `${udidMatch[1]}.+\\s+(\\S+com\\.apple\\.webinspectord_sim\\.socket)`;
    const pidMatch = stdout.match(new RegExp(pidPattern));
    if (!pidMatch) {
      log.debug(`Failed to get Web Inspector socket. lsof result: ${stdout}`);
      return null;
    }
    this.webInspectorSocket = pidMatch[1];
    return this.webInspectorSocket;
  }
}

export default SimulatorXcode93;
