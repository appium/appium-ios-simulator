// transpile:mocha

import { SimulatorXcode6 } from '../lib/simulator-xcode-6';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import _ from 'lodash';

let should = chai.should();
chai.use(chaiAsPromised);

let simulatorClasses = {
  'SimulatorXcode6': SimulatorXcode6
};

for (let [name, simClass] of _.pairs(simulatorClasses)) {
  describe(`common methods - ${name}`, () => {

    let sim = new simClass('123', '6.0.0');

    it('should exist', () => {
      should.exist(simClass);
    });

    it('should return a path for getDir()', () => {
      sim.getDir().should.exist;
    });

    


  });
}
