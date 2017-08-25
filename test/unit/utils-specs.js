// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import * as nodeSimctl from 'node-simctl';
import { killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert } from '../..';
import { devices } from '../assets/deviceList';
import Simulator from '../../lib/simulator-xcode-6';
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
const XCODE_VERSION_7 = {
  versionString: '7.1.1',
  versionFloat: 7.1,
  major: 7,
  minor: 1,
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

describe('util', () => {
  let execStub;
  let xcodeMock;
  let getDevicesStub;

  beforeEach(() => {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(nodeSimctl, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(() => {
    execStub.restore();
    xcodeMock.restore();
    nodeSimctl.getDevices.restore();
  });

  describe('killAllSimulators', () => {
    it('should call exec once if pgrep does not find any running Simulator with Xcode9', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_9));
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.calledOnce.should.be.true;
    });
    it('should call exec once if pgrep does not find any running Simulator with Xcode8', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_8));
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.calledOnce.should.be.true;
    });
    it('should call exec thrice if pgrep does find running Simulator with Xcode7 and shutdown succeeds', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_7));
      execStub.withArgs('pgrep').returns(0);
      execStub.withArgs('xcrun').returns(0);

      await killAllSimulators();
      execStub.calledThrice.should.be.true;
    });
    it('should call exec thrice if pgrep does find running Simulator with Xcode6 and shutdown fails', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_6));
      execStub.withArgs('pgrep').returns(0);
      execStub.withArgs('xcrun').throws();
      execStub.withArgs('pkill').returns(0);

      try {
        await killAllSimulators(500);
      } catch (e) {}
      execStub.calledThrice.should.be.true;
    });
    it('should call exec thrice if pgrep and simctl fail with Xcode8', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_8));
      execStub.withArgs('pgrep').throws({code: 3});
      execStub.withArgs('xcrun').throws();
      execStub.withArgs('pkill').throws({code: 1});

      await killAllSimulators(500).should.eventually.be.rejected;
      execStub.calledThrice.should.be.true;
    });
    it('should call exec thrice if pgrep and simctl fail with Xcode9', async () => {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_9));
      execStub.withArgs('pgrep').throws({code: 3});
      execStub.withArgs('xcrun').throws();
      execStub.withArgs('pkill').throws({code: 1});

      await killAllSimulators(500).should.eventually.be.rejected;
      execStub.calledThrice.should.be.true;
    });
  });

  describe('endAllSimulatorDaemons', () => {
    it('should call exec five times to stop and remove each service', async () => {
      await endAllSimulatorDaemons();
      execStub.callCount.should.equal(5);
    });
    it('should ignore all errors', async () => {
      execStub.throws();
      await endAllSimulatorDaemons().should.not.be.rejected;
      execStub.callCount.should.equal(5);
      execStub.threw().should.be.true;
    });
  });

  describe('simExists', () => {
    it('returns true if device is found', async () => {
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

    it('returns false if device is not found', async () => {
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

describe('installSSLCert and uninstallSSLCert', () => {

  it('should install and uninstall certs in keychain directories', async () => {
    let simulatorGetDirStub = sinon.stub(Simulator.prototype, 'getDir', function () {
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

  it('should throw exception if openssl is unavailable', async () => {
    let whichStub = sinon.stub(fs, 'which', () => {
      throw 'no openssl';
    });
    await installSSLCert(`doesn't matter`, `doesn't matter`).should.be.rejected;
    whichStub.calledOnce.should.be.true;
    whichStub.restore();
  });

  it('should throw exception on installSSLCert if udid is invalid', async () => {
    await installSSLCert('pem dummy text', 'invalid UDID').should.be.rejected;
  });

  it('should throw exception on uninstallSSLCert if udid is invalid', async () => {
    await uninstallSSLCert('pem dummy text', 'invalid UDID').should.be.rejected;
  });

});
