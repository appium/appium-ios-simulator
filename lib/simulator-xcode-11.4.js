import _ from 'lodash';
import { SimulatorXcode11 } from './simulator-xcode-11';

export class SimulatorXcode11_4 extends SimulatorXcode11 {
  /**
   * Sets UI appearance style.
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 11.4
   * @param {string} value one of possible appearance values:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   * @returns {Promise<void>}
   */
  setAppearance = async (value) => {
    await this.simctl.setAppearance(_.toLower(value));
  };

  /**
   * Gets the current UI appearance style
   * This function can only be called on a booted simulator.
   *
   * @override
   * @since Xcode SDK 11.4
   * @returns {Promise<string>} the current UI appearance style.
   * Possible values are:
   * - dark: to switch to the Dark mode
   * - light: to switch to the Light mode
   */
  getAppearance = async () => await this.simctl.getAppearance();

  /**
   * Adds the given certificate to the booted simulator.
   * The simulator could be in both running and shutdown states
   * in order for this method to run as expected.
   *
   * @override
   * @since Xcode 11.4
   * @param {string} payload the content of the PEM certificate
   * @param {import('./types').CertificateOptions} [opts={}]
   * @returns {Promise<boolean>}
   */
  addCertificate = async (payload, opts = {}) => {
    const {
      isRoot = true,
    } = opts;
    const methodName = isRoot ? 'addRootCertificate' : 'addCertificate';
    await this.simctl[methodName](payload, {raw: true});
    return true;
  };

  /**
   * Simulates push notification delivery to the booted simulator
   *
   * @override
   * @since Xcode SDK 11.4
   * @param {import('@appium/types').StringRecord} payload - The object that describes Apple push notification content.
   * It must contain a top-level "Simulator Target Bundle" key with a string value matching
   * the target application‘s bundle identifier and "aps" key with valid Apple Push Notification values.
   * For example:
   * {
   *   "Simulator Target Bundle": "com.apple.Preferences",
   *   "aps": {
   *     "alert": "This is a simulated notification!",
   *     "badge": 3,
   *     "sound": "default"
   *   }
   * }
   * @returns {Promise<void>}
   */
  pushNotification = async (payload) => {
    await this.simctl.pushNotification(payload);
  };

  /**
   * @override
   * @inheritdoc
   *
   * @returns {Promise<void>}
   */
  clearKeychains = async () => {
    await this.simctl.resetKeychain();
  };

  /**
   * @inheritdoc
   * @override
   *
   * @param {boolean} isUiClientRunning - process id of simulator UI client.
   * @param {import('./types').RunOptions} [opts={}] - arguments to start simulator UI client with.
   */
  async launchWindow (isUiClientRunning, opts) {
    // In xcode 11.4, UI Client must be first launched, otherwise
    // sim window stays minimized
    if (!isUiClientRunning) {
      await this.startUIClient(opts);
    }
    await this.boot();
  }

  /**
   * @inheritdoc
   * @override
   *
   * @return {Promise<import('./types').ProcessInfo[]>}
   */
  async ps () {
    const {stdout} = await this.simctl.spawnProcess([
      'launchctl', 'list'
    ]);
    /*
    Example match:
      PID	Status	Label
      -	0	com.apple.progressd
      22109	0	com.apple.CoreAuthentication.daemon
      21995	0	com.apple.cloudphotod
      22045	0	com.apple.homed
      22042	0	com.apple.dataaccess.dataaccessd
      -	0	com.apple.DragUI.druid
      22076	0	UIKitApplication:com.apple.mobilesafari[2b0f][rb-legacy]
    */
    const extractGroup = (lbl) => lbl.includes(':') ? lbl.split(':')[0] : null;
    const extractName = (lbl) => {
      let res = lbl;
      const colonIdx = res.indexOf(':');
      if (colonIdx >= 0 && res.length > colonIdx) {
        res = res.substring(colonIdx + 1);
      }
      const bracketIdx = res.indexOf('[');
      if (bracketIdx >= 0) {
        res = res.substring(0, bracketIdx);
      }
      return res;
    };

    const result = [];
    for (const line of stdout.split('\n')) {
      const trimmedLine = _.trim(line);
      if (!trimmedLine) {
        continue;
      }

      const [pidStr,, label] = trimmedLine.split(/\s+/);
      const pid = parseInt(pidStr, 10);
      if (!pid || !label) {
        continue;
      }

      result.push({
        pid,
        group: extractGroup(label),
        name: extractName(label),
      });
    }
    return result;
  }
}
