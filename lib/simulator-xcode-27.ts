import {DEVICE_HUB_UI_CLIENT_BUNDLE_ID} from './utils/index.js';
import {SimulatorXcode15} from './simulator-xcode-15.js';

export class SimulatorXcode27 extends SimulatorXcode15 {
  /** @inheritdoc */
  override get uiClientBundleId(): string {
    return DEVICE_HUB_UI_CLIENT_BUNDLE_ID;
  }
}
