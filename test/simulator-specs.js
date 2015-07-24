// transpile:mocha

import { getSimulator } from '../..';
import { SimulatorXcode6 } from '../lib/simulator-xcode-6';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import sinon from 'sinon';
import { devices } from './assets/deviceList';
import B from 'bluebird';
import xcode from 'appium-xcode';

let should = chai.should();
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

    await getSimulator('123').should.eventually.be.rejectedWith('version');
  });

  it('should throw an error if xcode version above 6', async () => {
    getVersionStub = sinon.stub(xcode, 'getVersion').returns('7.0.0');

    await getSimulator('123').should.eventually.be.rejectedWith('not yet');
  });

  it('should list stats for sim', async () => {
    getVersionStub = sinon.stub(xcode, 'getVersion').returns('6.0.0');
    let getDevicesStub = sinon.stub(simctl, 'getDevices').returns(devices);

    after(() => {
      getDevicesStub.restore();
    });

    let sims = [
      getSimulator('F33783B2-9EE9-4A99-866E-E126ADBAD410'),
      getSimulator('DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'),
      getSimulator('123')
    ];

    let stats = sims.map((simProm) => {
      return simProm.then((sim) => {
        return sim.stat();
      });
    });

    stats = await B.all(stats);

    stats[0].state.should.equal('Shutdown');
    stats[1].state.should.equal('Booted');
    should.not.exist(stats[2]);
  });

  //it.skip('should fail to get a simulator with non-existent udid')

  //it.skip('should create a new simulator')

  //it.skip('should dectroy a simulator')
  //TODO e2e tests. check that rootdir exists
});
