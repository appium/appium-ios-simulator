import SimulatorXcode9 from './simulator-xcode-9';
import { exec } from 'teen_process';


// https://regex101.com/r/MEL55t/1
const WEBINSPECTOR_SOCKET_REGEXP = /\s+(\S+com\.apple\.webinspectord_sim\.socket)/;

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
    //   launchd_s 69760 isaac    3u  unix 0x57aa4fceea3937f3      0t0      /private/tmp/com.apple.CoreSimulator.SimDevice.D7082A5C-34B5-475C-994E-A21534423B9E/syslogsock
    //   launchd_s 69760 isaac    5u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
    //   launchd_s 69760 isaac    6u  unix 0x57aa4fceea39372b      0t0      ->0x57aa4fceea3937f3
    //   launchd_s 69760 isaac    8u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
    //   launchd_s 69760 isaac    9u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
    //   launchd_s 69760 isaac   10u  unix 0x57aa4fceea395f03      0t0      /private/tmp/com.apple.launchd.2B2u8CkN8S/Listeners
    //   launchd_s 69760 isaac   11u  unix 0x57aa4fceea39598b      0t0      /private/tmp/com.apple.launchd.2j5k1TMh6i/com.apple.webinspectord_sim.socket
    //   launchd_s 69760 isaac   12u  unix 0x57aa4fceea394c43      0t0      /private/tmp/com.apple.launchd.4zm9JO9KEs/com.apple.testmanagerd.unix-domain.socket
    // these _appear_ to always be grouped together (so, the records for the particular sim are all in a group, before the next sim, etc.)
    // so starting from the correct UDID, we ought to be able to pull the next record with `com.apple.webinspectord_sim.socket` to get the correct socket
    let {stdout} = await exec('lsof', ['-aUc', 'launchd_sim']);
    for (let record of stdout.split('com.apple.CoreSimulator.SimDevice.')) {
      if (!record.includes(this.udid)) {
        continue;
      }
      const match = WEBINSPECTOR_SOCKET_REGEXP.exec(record);
      if (!match) {
        return null;
      }
      this.webInspectorSocket = match[1];
      return this.webInspectorSocket;
    }

    return null;
  }
}

export default SimulatorXcode93;
