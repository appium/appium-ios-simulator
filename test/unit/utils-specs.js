// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import * as nodeSimctl from 'node-simctl';
import { killAllSimulators, endAllSimulatorDaemons, simExists } from '../..';
import { devices } from '../assets/deviceList';


chai.should();
chai.use(chaiAsPromised);

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

describe('util', () => {
  let execStub;
  let xcodeMock;
  let getDevicesStub;

  beforeEach(() => {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(nodeSimctl, 'getDevices');
    getDevicesStub.returns(Promise.resolve(devices));
  });
  afterEach(() => {
    execStub.restore();
    xcodeMock.restore();
    nodeSimctl.getDevices.restore();
  });

  describe('killAllSimulators', () => {
    it('should call exec with Simulator for Xcode 7', async () => {
      xcodeMock.expects('getVersion').withArgs(true).returns(Promise.resolve(XCODE_VERSION_7));
      await killAllSimulators();
      execStub.calledOnce.should.be.true;
    });
    it('should call exec with iOS Simulator for Xcode 6', async () => {
      xcodeMock.expects('getVersion').withArgs(true).returns(Promise.resolve(XCODE_VERSION_6));
      await killAllSimulators();
      execStub.calledOnce.should.be.true;
    });
    it('should continue if application is not running error gets thrown', async () => {
      xcodeMock.expects('getVersion').withArgs(true).returns(Promise.resolve(XCODE_VERSION_7));
      execStub.throws('{"stdout":"","stderr":"0:24: execution error: iOS Simulator got an error: Application isn’t running. (-600)\n","code":1}');
      await killAllSimulators();
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
