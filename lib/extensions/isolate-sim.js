import { getDevices, deleteDevice } from 'node-simctl';
import log from '../logger';
import _ from 'lodash';


let extensions = {};

extensions.isolateSim = async function () {
  log.debug("Isolating the requested simulator by deleting all others");
  let devices = await getDevices();

  let udids = [];
  for (let [, deviceArr] of devices) {
    udids = udids.concat(_.pluck(deviceArr, 'udid'));
  }

  for (let udid of _.without(udids, this.udid)) {
    await deleteDevice(udid);
  }
};


export default extensions;
