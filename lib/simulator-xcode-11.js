import SimulatorXcode10 from './simulator-xcode-10';
import path from 'path';
import { getDeveloperRoot } from './utils.js';
import * as settings from './settings';


class SimulatorXcode11 extends SimulatorXcode10 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);
  }

  /**
   * @override
   */
  async getLaunchDaemonsRoot () {
    const devRoot = await getDeveloperRoot();
    return path.resolve(devRoot,
      'Platforms/iPhoneOS.platform/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS.simruntime/Contents/Resources/RuntimeRoot/System/Library/LaunchDaemons');
  }

  /**
   * @override
   */
  async setDarkMode (isEnabled = true) {
    await settings.setDarkMode(this, isEnabled);
  }
}

export default SimulatorXcode11;
