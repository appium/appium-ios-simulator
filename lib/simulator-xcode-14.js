import SimulatorXcode11_4 from './simulator-xcode-11.4';

class SimulatorXcode14 extends SimulatorXcode11_4 {
  /**
   * @override
   * @inheritdoc
   */
  async setGeolocation (latitude, longitude) {
    await this.simctl.setLocation(latitude, longitude);
  }
}

export default SimulatorXcode14;
