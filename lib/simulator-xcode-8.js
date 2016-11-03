import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';


class SimulatorXcode8 extends SimulatorXcode7 {
  constructor (udid, xcodeVersion) {
    super(udid, xcodeVersion);

    // list of files to check for when seeing if a simulator is "fresh"
    // (meaning it has never been booted).
    // If these files are present, we assume it's been successfully booted
    this.isFreshFiles = [
      'Library/Cookies',
      'Library/Preferences/.GlobalPreferences.plist',
      'Library/Preferences/com.apple.springboard.plist',
      'var/run/syslog.pid'
    ];

    this.extraStartupTime = 10000;
  }

  async getBootedIndicatorString () {
    let indicator;
    let platformVersion = await this.getPlatformVersion();
    switch (platformVersion) {
      case '9.0':
      case '9.1':
      case '9.2':
      case '9.3':
        indicator = 'System app "com.apple.springboard" finished startup';
        break;
      case '10.0':
      case '10.1':
      case '10.2':
        indicator = 'com.apple.springboard';
        break;
      default:
        log.warn(`No boot indicator case for platform version '${platformVersion}'`);
        indicator = 'no boot indicator string available';
    }
    return indicator;
  }

}

export default SimulatorXcode8;
