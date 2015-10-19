// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import { killAllSimulators, endAllSimulatorDaemons } from '../..';


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

  beforeEach(() => {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
  });
  afterEach(() => {
    execStub.restore();
    xcodeMock.restore();
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
});
