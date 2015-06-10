// transpile:mocha

import { getSimulator } from '../..';
import { SimulatorXcode6 } from '../lib/simulator-xcode-6';
import * as xcode from 'appium-xcode';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import sinon from 'sinon';

/*let should =*/ chai.should();
chai.use(chaiAsPromised);

describe('sample', () => {

  let getVersionStub;

  afterEach( () => {
    getVersionStub.restore();
  });

  it('should create a simulator with default xcode version', async () => {
    getVersionStub = sinon.stub(xcode, 'getVersion').returns('6.0.0');

    let sim = await getSimulator('123');
    sim.xcodeVersion.should.equal('6.0.0');
    (sim instanceof SimulatorXcode6).should.equal(true);
  });

  it('should throw an error if xcode version less than 6', async () => {
    getVersionStub = sinon.stub(xcode, 'getVersion').returns('5.4.0');

    let sim = getSimulator('123');
    sim.should.eventually.be.rejectedWith('version');
  });

  it('should throw an error if xcode version above 6', async () => {
    getVersionStub = sinon.stub(xcode, 'getVersion').returns('7.0.0');

    let sim = getSimulator('123');
    sim.should.eventually.be.rejectedWith('not yet');
  });

  //TODO e2e tests. check that rootdir exists
});
