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

    // lsof -aUc launchd_sim
    // gives a set of records like:
    //   COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
    //   launchd_s 81243 mwakizaka    3u  unix 0x9461828ef425ac31      0t0      /private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket
    //   launchd_s 81243 mwakizaka    4u  unix 0x9461828ef425bc99      0t0      /tmp/com.apple.CoreSimulator.SimDevice.F1191A22-11DD-408E-8CAF-0BC4A8F79E3B/syslogsock
    //   launchd_s 81243 mwakizaka    6u  unix 0x9461828ef27d4c39      0t0      ->0x9461828ef27d4b71
    //   launchd_s 81243 mwakizaka    7u  unix 0x9461828ef425dd69      0t0      ->0x9461828ef27d5021
    //   launchd_s 81243 mwakizaka    8u  unix 0x9461828ef425b4c9      0t0      /private/tmp/com.apple.launchd.88z8qTMoJA/Listeners
    //   launchd_s 81243 mwakizaka    9u  unix 0x9461828ef425be29      0t0      /private/tmp/com.apple.launchd.rbqFyGyXrT/com.apple.testmanagerd.unix-domain.socket
    //   launchd_s 81243 mwakizaka   10u  unix 0x9461828ef425b4c9      0t0      /private/tmp/com.apple.launchd.88z8qTMoJA/Listeners
    //   launchd_s 81243 mwakizaka   11u  unix 0x9461828ef425c081      0t0      /private/tmp/com.apple.launchd.zHidszZQUZ/com.apple.testmanagerd.remote-automation.unix-domain.socket
    //   launchd_s 81243 mwakizaka   12u  unix 0x9461828ef425def9      0t0      ->0x9461828ef425de31
    //   launchd_s 35621 mwakizaka    4u  unix 0x7b7dbedd6d63253f      0t0      /tmp/com.apple.CoreSimulator.SimDevice.150983FD-82FB-4A7B-86DC-D3D264DD90E5/syslogsock
    //   launchd_s 35621 mwakizaka    5u  unix 0x7b7dbedd6d62f727      0t0      /private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket
    //   launchd_s 35621 mwakizaka    9u  unix 0x7b7dbedd6d632607      0t0      /private/tmp/com.apple.launchd.KbYwOrA36E/Listeners
    //   launchd_s 35621 mwakizaka   10u  unix 0x7b7dbedd6d62f727      0t0      /private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket
    //   launchd_s 35621 mwakizaka   11u  unix 0x7b7dbedd6d62e6bf      0t0      /private/tmp/com.apple.launchd.7wTVfXC9QX/com.apple.testmanagerd.unix-domain.socket
    //   launchd_s 35621 mwakizaka   12u  unix 0x7b7dbedd6d632607      0t0      /private/tmp/com.apple.launchd.KbYwOrA36E/Listeners
    //   launchd_s 35621 mwakizaka   13u  unix 0x7b7dbedd6d62e84f      0t0      /private/tmp/com.apple.launchd.g7KQlSsvXT/com.apple.testmanagerd.remote-automation.unix-domain.socket
    //   launchd_s 35621 mwakizaka   15u  unix 0x7b7dbedd6d62e6bf      0t0      /private/tmp/com.apple.launchd.7wTVfXC9QX/com.apple.testmanagerd.unix-domain.socket
    //   launchd_s 35621 mwakizaka   16u  unix 0x7b7dbedd6d62e84f      0t0      /private/tmp/com.apple.launchd.g7KQlSsvXT/com.apple.testmanagerd.remote-automation.unix-domain.socket
    // these _appear_ to always be grouped together by PID for each simulator.
    // Therefore, by obtaining simulator PID with an expected simulator UDID,
    // we can get the correct `com.apple.webinspectord_sim.socket`
    // without depending on the order of `lsof -aUc launchd_sim` result.
    const {stdout} = await exec('lsof', ['-aUc', 'launchd_sim']);
    const udidPattern = `([0-9]{1,5}).+${this.udid}`;
    const udidMatch = stdout.match(new RegExp(udidPattern));
    if (!udidMatch) {
      log.debug(`Failed to get Web Inspector socket with ${udidPattern} pattern`);
      return null;
    }

    const pidPattern = `${udidMatch[1]}.+\\s+(\\S+com.apple.webinspectord_sim.socket)`;
    const pidMatch = stdout.match(new RegExp(pidPattern));
    if (!pidMatch) {
      log.debug(`Failed to get Web Inspector socket with ${pidPattern} pattern`);
      return null;
    }
    this.webInspectorSocket = pidMatch[1];
    return this.webInspectorSocket;
  }
}

export default SimulatorXcode93;
