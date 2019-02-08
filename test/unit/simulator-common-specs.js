// transpile:mocha

import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import SimulatorXcode7 from '../../lib/simulator-xcode-7';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import sinon from 'sinon';
import { fs } from 'appium-support';
import B from 'bluebird';

chai.should();
chai.use(chaiAsPromised);

let simulatorClasses = {
  SimulatorXcode6,
  SimulatorXcode7
};

for (let [name, simClass] of _.toPairs(simulatorClasses)) {
  describe(`common methods - ${name}`, function () {
    let sim;
    beforeEach(function () {
      sim = new simClass('123', '6.0.0');
    });

    it('should exist', function () {
      simClass.should.exist;
    });

    it('should return a path for getDir()', function () {
      sim.getDir().should.exist;
    });

    it('should return an array for getAppDirs()', async function () {
      let stub = sinon.stub(sim, 'getAppDir').returns(B.resolve(['/App/Path/']));
      sim._platformVersion = 9.1;
      let dirs = await sim.getAppDirs('test');
      dirs.should.have.length(2);
      dirs.should.be.a('array');
      stub.restore();
    });

    describe('cleanCustomApp', function () {
      let sandbox;
      let appBundleId = 'com.some.app';
      beforeEach(function () {
        sandbox = sinon.createSandbox();
        sandbox.spy(fs, 'rimraf');
      });
      afterEach(function () {
        sandbox.restore();
      });
      it('should not delete anything if no directories are found', async function () {
        sandbox.stub(sim, 'getPlatformVersion').returns(B.resolve(7.1));
        sandbox.stub(sim, 'getAppDir').returns(B.resolve());
        await sim.cleanCustomApp('someApp', 'com.some.app');
        sinon.assert.notCalled(fs.rimraf);
      });
      it('should delete app directories', async function () {
        sandbox.stub(sim, 'getPlatformVersion').returns(B.resolve(7.1));
        sandbox.stub(sim, 'getAppDirs').returns(B.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', 'com.some.app');
        sinon.assert.called(fs.rimraf);
      });
      it('should delete plist file for iOS8+', async function () {
        sandbox.stub(sim, 'getPlatformVersion').returns(B.resolve(9));
        sandbox.stub(sim, 'getAppDirs').returns(B.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', appBundleId);
        sinon.assert.calledWithMatch(fs.rimraf, /plist/);
      });
      it('should not delete plist file for iOS7.1', async function () {
        sandbox.stub(sim, 'getPlatformVersion').returns(B.resolve(7.1));
        sandbox.stub(sim, 'getAppDirs').returns(B.resolve(['/some/path', '/another/path']));
        await sim.cleanCustomApp('someApp', appBundleId);
        sinon.assert.neverCalledWithMatch(fs.rimraf, /plist/);
      });
    });

    it('should return a path for getLogDir', function () {
      const home = process.env.HOME;
      process.env.HOME = __dirname;
      let logDir = sim.getLogDir();
      logDir.should.equal(`${__dirname}/Library/Logs/CoreSimulator/123`);
      process.env.HOME = home;
    });

    describe('getPlatformVersion', function () {
      let statStub;
      let platformVersion = 8.9;
      beforeEach(function () {
        statStub = sinon.stub(sim, 'stat').returns({sdk: platformVersion});
      });
      afterEach(function () {
        statStub.restore();
      });
      it('should get the correct platform version', async function () {
        let pv = await sim.getPlatformVersion();
        pv.should.equal(platformVersion);
      });
      it('should only call stat once', async function () {
        let pv = await sim.getPlatformVersion();
        pv.should.equal(platformVersion);
        statStub.calledOnce.should.be.true;
      });
    });
  });
}
