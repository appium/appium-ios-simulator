import Simctl from 'node-simctl';
import log from '../logger';
import _ from 'lodash';


let extensions = {};

async function getAllUdids (simctl) {
  let devices = await simctl.getDevices();

  return _.chain(devices)
    .values()
    .flatten()
    .map('udid')
    .value();
}

extensions.isolateSim = async function isolateSim () {
  log.debug('Isolating the requested simulator by deleting all others');
  const simctl = new Simctl();
  const udids = await getAllUdids(simctl);

  for (const udid of _.without(udids, this.udid)) {
    simctl.udid = udid;
    await simctl.deleteDevice();
  }
};


export { extensions, getAllUdids };
