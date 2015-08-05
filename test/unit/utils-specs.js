// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import sinon from 'sinon';
import * as TeenProcess from 'teen_process';
import { killAllSimulators } from '../../lib/utils';

chai.should();
chai.use(chaiAsPromised);

describe('util', () => {
  let execStub = sinon.stub(TeenProcess, 'exec');

  afterEach(() => {
    execStub.reset();
  });

  describe('killAllSimulators', () => {
    it('should call exec', async () => {
      await killAllSimulators();
      execStub.calledOnce.should.be.true;
      execStub.calledWith('pkill', ['-9', '-f', 'iOS Simulator']).should.be.true;
    });
    it('should ignore errors thrown by exec', async () => {
      execStub.throws();
      await killAllSimulators().should.not.be.rejected;
      execStub.threw().should.be.true;
    });
  });
});
