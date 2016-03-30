import SimulatorXcode7 from './simulator-xcode-7';


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
}

export default SimulatorXcode73;
