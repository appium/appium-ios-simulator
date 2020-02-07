// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import Simctl from 'node-simctl';
import {
  killAllSimulators, endAllSimulatorDaemons, simExists,
  installSSLCert, uninstallSSLCert
} from '../..';
import { toBiometricDomainComponent } from '../../lib/utils';
import { devices } from '../assets/deviceList';
import Simulator from '../../lib/simulator-xcode-6';
import SimulatorXcode9 from '../../lib/simulator-xcode-9';
import { fs } from 'appium-support';
import path from 'path';


chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

const XCODE_VERSION_9 = {
  versionString: '9.0',
  versionFloat: 9.0,
  major: 9,
  minor: 0,
  patch: undefined
};
const XCODE_VERSION_8 = {
  versionString: '8.2.1',
  versionFloat: 8.2,
  major: 8,
  minor: 2,
  patch: 1
};
const XCODE_VERSION_6 = {
  versionString: '6.1.1',
  versionFloat: 6.1,
  major: 6,
  minor: 1,
  patch: 1
};


let assetsDir = `${process.cwd()}/test/assets`;

describe('util', function () {
  let execStub;
  let xcodeMock;
  let getDevicesStub;

  beforeEach(function () {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(Simctl.prototype, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(function () {
    execStub.restore();
    xcodeMock.restore();
    Simctl.prototype.getDevices.restore();
  });

  describe('killAllSimulators', function () {
    it('should call exec if pgrep does not find any running Simulator with Xcode9', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_9));
      execStub.withArgs('xcrun').returns();
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.callCount.should.equal(2);
    });
    it('should call exec if pgrep does not find any running Simulator with Xcode8', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_8));
      execStub.withArgs('xcrun').returns();
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.callCount.should.equal(2);
    });
    it('should call exec if pgrep does find running Simulator with Xcode6 and shutdown fails', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_6));
      execStub.withArgs('pgrep').returns('0');
      execStub.withArgs('xcrun').throws();
      execStub.withArgs('pkill').returns();

      try {
        await killAllSimulators(500);
      } catch (e) {}
      execStub.callCount.should.equal(3);
    });
  });

  describe('endAllSimulatorDaemons', function () {
    it('should call exec five times to stop and remove each service', async function () {
      await endAllSimulatorDaemons();
      execStub.callCount.should.equal(5);
    });
    it('should ignore all errors', async function () {
      execStub.throws();
      await endAllSimulatorDaemons().should.not.be.rejected;
      execStub.callCount.should.equal(5);
      execStub.threw().should.be.true;
    });
  });

  describe('simExists', function () {
    it('returns true if device is found', async function () {
      let existence = [
        simExists('C09B34E5-7DCB-442E-B79C-AB6BC0357417'),
        simExists('FA5C971D-4E05-4AA3-B48B-C9619C7453BE'),
        simExists('E46EFA59-E2B4-4FF9-B290-B61F3CFECC65'),
        simExists('F33783B2-9EE9-4A99-866E-E126ADBAD410')
      ];

      let results = await B.all(existence);

      for (let result of results) {
        result.should.be.true;
      }
    });

    it('returns false if device is not found', async function () {
      let existence = [];
      existence.push(simExists('A94E4CD7-D412-4198-BCD4-26799672975E'));
      existence.push(simExists('asdf'));
      existence.push(simExists(4));

      let results = await B.all(existence);

      for (let result of results) {
        result.should.be.false;
      }
    });
  });

});

describe('installSSLCert and uninstallSSLCert', function () {

  it('should install and uninstall certs in keychain directories', async function () {
    let simulatorGetDirStub = sinon.stub(Simulator.prototype, 'getDir').callsFake(function () {
      return path.resolve(assetsDir);
    });
    let testPem = await fs.readFile(path.resolve(assetsDir, 'test-pem.pem'));
    let certificate = await installSSLCert(testPem, `using mock, udid doesn't matter`);
    let certExistsInAssetsDir = await certificate.has(assetsDir);
    expect(certExistsInAssetsDir).to.be.true;
    await uninstallSSLCert(testPem, `using mock, udid doesn't matter`);
    certExistsInAssetsDir = await certificate.has(assetsDir);
    expect(certExistsInAssetsDir).to.be.false;
    simulatorGetDirStub.restore();
  });

  it('should throw exception if openssl is unavailable', async function () {
    let whichStub = sinon.stub(fs, 'which').callsFake(function () {
      throw new Error('no openssl');
    });
    await installSSLCert(`doesn't matter`, `doesn't matter`).should.be.rejected;
    whichStub.calledOnce.should.be.true;
    whichStub.restore();
  });

  it('should throw exception on installSSLCert if udid is invalid', async function () {
    await installSSLCert('pem dummy text', 'invalid UDID').should.be.rejected;
  });

  it('should throw exception on uninstallSSLCert if udid is invalid', async function () {
    await uninstallSSLCert('pem dummy text', 'invalid UDID').should.be.rejected;
  });

});

describe('Device preferences verification', function () {
  const sim = new SimulatorXcode9('1234', XCODE_VERSION_9);

  describe('for SimulatorWindowLastScale option', function () {

    it('should pass if correct', function () {
      const validValues = [0.5, 1, 1.5];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowLastScale: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = [-1, 0.0, '', 'abc', null];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowLastScale: invalidValue
        })).should.throw(Error, /is expected to be a positive float value/);
      }
    });

  });

  describe('for SimulatorWindowCenter option', function () {

    it('should pass if correct', function () {
      const validValues = ['{0,0}', '{0.0,0}', '{0,0.0}', '{-10,0}', '{0,-10}',
        '{-32.58,0}', '{0,-32.58}', '{-32.58,-32.58}'];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowCenter: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', '{}', '{,}', '{0,}', '{,0}', '{abc}', null,
        '{-10,-10', '{0. 0, 0}', '{ 0,0}', '{0, 0}'];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowCenter: invalidValue
        })).should.throw(Error, /is expected to match/);
      }
    });

  });

  describe('for SimulatorWindowOrientation option', function () {

    it('should pass if correct', function () {
      const validValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowOrientation: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'portrait', 'bla', -1];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowOrientation: invalidValue
        })).should.throw(Error, /is expected to be one of/);
      }
    });

  });

  describe('for SimulatorWindowRotationAngle option', function () {

    it('should pass if correct', function () {
      const validValues = [0, -100, 100, 1.0];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowRotationAngle: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'bla', '0'];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowRotationAngle: invalidValue
        })).should.throw(Error, /is expected to be a valid number/);
      }
    });
  });

  describe('toBiometricDomainComponent', function () {
    it('return touch id object', function () {
      toBiometricDomainComponent('touchId').should.eql('fingerTouch');
    });
    it('return face id object', function () {
      toBiometricDomainComponent('faceId').should.eql('pearl');
    });

    it('raise an error since the argument does not exist in biometric', function () {
      (function () {
        toBiometricDomainComponent('no-touchId');
      }).should.throw();
    });
  });
});
