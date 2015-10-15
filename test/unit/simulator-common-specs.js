// transpile:mocha

import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import SimulatorXcode7 from '../../lib/simulator-xcode-7';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';

chai.should();
chai.use(chaiAsPromised);

let simulatorClasses = {
  'SimulatorXcode6': SimulatorXcode6,
  'SimulatorXcode7': SimulatorXcode7
};

for (let [name, simClass] of _.pairs(simulatorClasses)) {
  describe(`common methods - ${name}`, () => {
    let sim = new simClass('123', '6.0.0');

    it('should exist', () => {
      simClass.should.exist;
    });

    it('should return a path for getDir()', () => {
      sim.getDir().should.exist;
    });
  });
}
