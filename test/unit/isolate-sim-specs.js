// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import * as nodeSimctl from 'node-simctl';
import { devices } from '../assets/deviceList';
import { getAllUdids } from '../../lib/extensions/isolate-sim.js';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);


describe('isolate sims', function () {
  let getDevicesStub;

  beforeEach(function () {
    getDevicesStub = sinon.stub(nodeSimctl, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(function () {
    nodeSimctl.getDevices.restore();
  });

  it('getAllUdids', async function () {
    let udids = await getAllUdids();
    for (let udid in udids) {
      udid.should.be.a('string');
    }
    udids.length.should.equal(26);
  });
});
