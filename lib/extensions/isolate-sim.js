import { getDevices, deleteDevice } from 'node-simctl';
import log from '../logger';
import _ from 'lodash';


let extensions = {};

async function getAllUdids () {
  let devices = await getDevices();

  return _.chain(devices)
    .values()
    .flatten()
    .map('udid')
    .value();
}

extensions.isolateSim = async function isolateSim () {
  log.debug('Isolating the requested simulator by deleting all others');
  let udids = await getAllUdids();

  for (let udid of _.without(udids, this.udid)) {
    await deleteDevice(udid);
  }
};


export { extensions, getAllUdids };
