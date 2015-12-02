// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import * as nodeSimctl from 'node-simctl';
import { devices } from '../assets/deviceList';
import { getAllUdids } from '../../lib/extensions/isolate-sim.js';


chai.should();
chai.use(chaiAsPromised);


describe('isolate sims', () => {
  let getDevicesStub;

  beforeEach(() => {
    getDevicesStub = sinon.stub(nodeSimctl, 'getDevices');
    getDevicesStub.returns(Promise.resolve(devices));
  });
  afterEach(() => {
    nodeSimctl.getDevices.restore();
  });

  it('getAllUdids', async () => {
    let udids = await getAllUdids();
    for (let udid in udids) {
      udid.should.be.a('string');
    }
    udids.length.should.equal(26);
  });
});
