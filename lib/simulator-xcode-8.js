import SimulatorXcode7 from './simulator-xcode-7';
import log from './logger';


// these sims are sloooooooow
const STARTUP_TIMEOUT = 120 * 1000;
const EXTRA_STARTUP_TIME = 2000;

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

    this.extraStartupTime = EXTRA_STARTUP_TIME;
  }

  get startupTimeout () {
    return STARTUP_TIMEOUT;
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
      case '10.3':
        indicator = 'SMS Plugin initialized';
        break;
      default:
        log.warn(`No boot indicator case for platform version '${platformVersion}'`);
        indicator = 'no boot indicator string available';
    }
    return indicator;
  }

}

export default SimulatorXcode8;
