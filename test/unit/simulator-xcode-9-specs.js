// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import SimulatorXcode9 from "../../lib/simulator-xcode-9";

chai.should();
chai.use(chaiAsPromised);

const XCODE_VERSION_9 = {
  versionString: '9.0',
  versionFloat: 9.0,
  major: 9,
  minor: 0,
  patch: undefined
};

describe('SimulatorXcode9', function () {
  let simulatorXcode9;

  beforeEach(function () {
    simulatorXcode9 = new SimulatorXcode9('1234', XCODE_VERSION_9);
  });

  describe('getBiometric', function () {
    it('return touch id object', function () {
      simulatorXcode9.getBiometric('touchId').should.eql({ menuName: 'Touch Id' });
    });

    it('raise an error since the argument does not exist in biometric', function () {
      (function () {
        simulatorXcode9.getBiometric('no-touchId');
      }).should.throw(Error, 'no-touchId is not a valid biometric. Use one of: ["touchId","faceId"]');
    });
  });
});
