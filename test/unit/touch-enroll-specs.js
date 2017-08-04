// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
// import { exec } from 'teen_process';
// import B from 'bluebird';
import * as TouchEnroll from '../../lib/touch-enroll';
import * as TeenProcess from 'teen_process';
import sinon from 'sinon';

chai.should();
chai.use(chaiAsPromised);

describe('touch-enroll.js', () => {

  describe('getUserDefault()', () => {
    let execStub;

    before(async () => {
      execStub = sinon.stub(TeenProcess, 'exec');
    });

    afterEach(async () => {
      execStub.restore();
    });

    it('should parse the syntax that "defaults read ..." returns', async () => {
      execStub.returns({
        stdout: `{
          "Toggle Enrolled State" = "foo";
          "Touch ID Enrolled" = "bar";
        }`,
      });
      await TouchEnroll.getUserDefault(undefined, 'Toggle Enrolled State').should.eventually.equal('foo');
      await TouchEnroll.getUserDefault(undefined, 'Touch ID Enrolled').should.eventually.equal('bar');
    });

    it('should return undefined if the value is nil', async () => {
      execStub.returns({
        stdout: `{
          "Toggle Enrolled State" = nil;
          "Touch ID Enrolled" = nil;
        }`,
      });
      await TouchEnroll.getUserDefault(undefined, 'Toggle Enrolled State').should.eventually.not.exist;
      await TouchEnroll.getUserDefault(undefined, 'Touch ID Enrolled').should.eventually.not.exist;
    });

    it('should return undefined if the value is blank parantheses', async () => {
      execStub.returns({
        stdout: `{}`,
      });
      await TouchEnroll.getUserDefault(undefined, 'Toggle Enrolled State').should.eventually.not.exist;
      await TouchEnroll.getUserDefault(undefined, 'Touch ID Enrolled').should.eventually.not.exist;
    });

    it('should return undefined if the call to exec throws a stderr', async () => {
      execStub.throws();
      await TouchEnroll.getUserDefault(undefined, 'Toggle Enrolled State').should.eventually.not.exist;
      await TouchEnroll.getUserDefault(undefined, 'Touch ID Enrolled').should.eventually.not.exist;

    });

  });

});
