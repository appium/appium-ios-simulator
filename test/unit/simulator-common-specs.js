// transpile:mocha

import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import SimulatorXcode7 from '../../lib/simulator-xcode-7';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import sinon from 'sinon';


chai.should();
chai.use(chaiAsPromised);

let simulatorClasses = {
  'SimulatorXcode6': SimulatorXcode6,
  'SimulatorXcode7': SimulatorXcode7
};

for (let [name, simClass] of _.pairs(simulatorClasses)) {
  describe(`common methods - ${name}`, () => {
    let sim;
    beforeEach(() => {
      sim = new simClass('123', '6.0.0');
    });

    it('should exist', () => {
      simClass.should.exist;
    });

    it('should return a path for getDir()', () => {
      sim.getDir().should.exist;
    });

    it('should return an array for getAppDirs()', async () => {
      sinon.stub(sim, 'getAppDir').returns(Promise.resolve(['/App/Path/']));
      sim._platformVersion = 9.1;
      let dirs = await sim.getAppDirs('test');
      dirs.should.have.length(2);
      dirs.should.be.a('array');
      sinon.restore();
    });

    it('should return a path for getLogDir', () => {
      process.env.HOME = __dirname;
      let logDir = sim.getLogDir();
      logDir.should.equal(`${__dirname}/Library/Logs/CoreSimulator/123`);
    });

    describe('getPlatformVersion', () => {
      let statStub;
      let platformVersion = 8.9;
      beforeEach(() => {
        statStub = sinon.stub(sim, 'stat').returns({sdk: platformVersion});
      });
      afterEach(() => {
        statStub.restore();
      });
      it('should get the correct platform version', async () => {
        let pv = await sim.getPlatformVersion();
        pv.should.equal(platformVersion);
      });
      it('should only call stat once', async () => {
        let pv = await sim.getPlatformVersion();
        pv.should.equal(platformVersion);
        statStub.calledOnce.should.be.true;
      });
    });
  });
}
