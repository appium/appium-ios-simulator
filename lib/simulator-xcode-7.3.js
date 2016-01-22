import SimulatorXcode7 from './simulator-xcode-7';
import path from 'path';

class SimulatorXcode73 extends SimulatorXcode7 {

  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    this.isFreshFiles = [
      'Library/UserConfigurationProfiles',
      'Library/Cookies',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];
  }

  async buildBundlePathMap (subDir = `Containers${path.sep}Data`) {
    if (subDir === 'Data') {
      subDir = 'Containers' + path.sep + 'Data';
    }

    return await super.buildBundlePathMap(subDir);
  }
}

export default SimulatorXcode73;
