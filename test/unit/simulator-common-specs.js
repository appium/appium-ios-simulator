// transpile:mocha

import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import SimulatorXcode7 from '../../lib/simulator-xcode-7';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import sinon from 'sinon';
import { fs } from 'appium-support';

chai.should();
chai.use(chaiAsPromised);

let simulatorClasses = {
  'SimulatorXcode6': SimulatorXcode6,
  'SimulatorXcode7': SimulatorXcode7
};

for (let [name, simClass] of _.toPairs(simulatorClasses)) {
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

    describe('cleanCustomApp', () => {
      let sandbox;
      let appBundleId = 'com.some.app';
      beforeEach(() => {
        sandbox = sinon.sandbox.create();
        sandbox.spy(fs, 'rimraf');
      });
      afterEach(() => {
        sandbox.restore();
      });
      it('should not delete anything if no directories are found', async () => {
        sandbox.stub(sim, 'getPlatformVersion').returns(Promise.resolve(7.1));
        sandbox.stub(sim, 'getAppDir').returns(Promise.resolve());
        await sim.cleanCustomApp('someApp', 'com.some.app');
        sinon.assert.notCalled(fs.rimraf);
      });
      it('should delete app directories', async () => {
        sandbox.stub(sim, 'getPlatformVersion').returns(Promise.resolve(7.1));
        sandbox.stub(sim, 'getAppDirs').returns(Promise.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', 'com.some.app');
        sinon.assert.called(fs.rimraf);
      });
      it('should delete plist file for iOS8+', async () => {
        sandbox.stub(sim, 'getPlatformVersion').returns(Promise.resolve(9));
        sandbox.stub(sim, 'getAppDirs').returns(Promise.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', appBundleId);
        sinon.assert.calledWithMatch(fs.rimraf, /plist/);
      });
      it('should not delete plist file for iOS7.1', async () => {
        sandbox.stub(sim, 'getPlatformVersion').returns(Promise.resolve(7.1));
        sandbox.stub(sim, 'getAppDirs').returns(Promise.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', appBundleId);
        sinon.assert.neverCalledWithMatch(fs.rimraf, /plist/);
      });
    });

    it('should return a path for getLogDir', () => {
      var home = process.env.HOME;
      process.env.HOME = __dirname;
      let logDir = sim.getLogDir();
      logDir.should.equal(`${__dirname}/Library/Logs/CoreSimulator/123`);
      process.env.HOME = home;
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
