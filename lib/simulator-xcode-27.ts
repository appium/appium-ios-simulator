import {SimulatorXcode15} from './simulator-xcode-15';

const UI_CLIENT_BUNDLE_ID = 'com.apple.dt.Devices';

export class SimulatorXcode27 extends SimulatorXcode15 {
  /** @inheritdoc */
  override get uiClientBundleId(): string {
    return UI_CLIENT_BUNDLE_ID;
  }
}
