// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import * as nodeSimctl from 'node-simctl';
import { killAllSimulators, endAllSimulatorDaemons, simExists } from '../..';


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
      execStub.calledWith('pkill', ['-9', '-f', 'Simulator']).should.be.true;
    });
    it('should call exec with iOS Simulator for Xcode 6', async () => {
      xcodeMock.expects('getVersion').withArgs(true).returns(Promise.resolve(XCODE_VERSION_6));
      await killAllSimulators();
      execStub.calledOnce.should.be.true;
      execStub.calledWith('pkill', ['-9', '-f', 'iOS Simulator']).should.be.true;
    });
    it('should ignore errors thrown by exec', async () => {
      xcodeMock.expects('getVersion').withArgs(true).returns(Promise.resolve(XCODE_VERSION_7));
      execStub.throws();
      await killAllSimulators().should.not.be.rejected;
      execStub.threw().should.be.true;
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
    const devicesStub = {
    '7.1': [
     { name: 'iPhone 5',
       udid: 'B236B73C-8EFA-4284-AC1F-2A45F3286E4C',
       state: 'Shutdown' },
     { name: 'iPhone 5s',
       udid: '8E248C90-0F79-46AD-9CAA-8DF3B6E3FBA6',
       state: 'Shutdown' },
     { name: 'iPad Air',
       udid: 'FA5C971D-4E05-4AA3-B48B-C9619C7453BE',
       state: 'Shutdown' } ],
    '8.1': [
     { name: 'iPhone 5',
       udid: 'B5048708-566E-45D5-9885-C878EF7D6D13',
       state: 'Shutdown' },
     { name: 'iPhone 5s',
       udid: '2F7678F2-FD52-497F-9383-41D3BB401FBD',
       state: 'Shutdown' },
     { name: 'iPhone 6 Plus',
       udid: '013D6994-B4E6-4548-AD77-C0D7C6C6D245',
       state: 'Shutdown' } ],
    '8.3': [
     { name: 'iPhone 5',
       udid: '813AAB6A-32C8-4859-A5CF-F3355C244F54',
       state: 'Shutdown' },
     { name: 'iPhone 5s',
       udid: '9D3A405E-65D6-4743-85DA-E644DA9A8373',
       state: 'Shutdown' },
     { name: 'iPhone 6 Plus',
       udid: 'D94E4CD7-D412-4198-BCD4-26799672975E',
       state: 'Shutdown' },
     { name: 'iPhone 6',
       udid: '26EAADAE-1CD5-42F9-9A4C-50554CDF0910',
       state: 'Shutdown' },
     { name: 'iPad 2',
       udid: 'C8E68217-82E6-42A8-8326-9824CA2E7C7C',
       state: 'Shutdown' } ]
  };

  it('returns true if device is found', async () => {
    getDevicesStub.returns(Promise.resolve(devicesStub));
    let existence = [];
     existence.push(simExists('D94E4CD7-D412-4198-BCD4-26799672975E'));
     existence.push(simExists('C8E68217-82E6-42A8-8326-9824CA2E7C7C'));
     existence.push(simExists('B5048708-566E-45D5-9885-C878EF7D6D13'));
     existence.push(simExists('8E248C90-0F79-46AD-9CAA-8DF3B6E3FBA6'));

     let results = await B.all(existence);

     for (let result of results) {
       result.should.be.true;
     }
  });

  it('returns false if device is not found', async () => {
    getDevicesStub.returns(Promise.resolve(devicesStub));
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
