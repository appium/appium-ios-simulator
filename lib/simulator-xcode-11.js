import { SimulatorXcode10 } from './simulator-xcode-10';
import path from 'path';
import { getDeveloperRoot } from './utils.js';

export class SimulatorXcode11 extends SimulatorXcode10 {
  /**
   * @override
   * @return {Promise<string>}
   */
  async getLaunchDaemonsRoot () {
    const devRoot = await getDeveloperRoot();
    return path.resolve(devRoot,
      'Platforms/iPhoneOS.platform/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS.simruntime/Contents/Resources/RuntimeRoot/System/Library/LaunchDaemons');
  }
}
