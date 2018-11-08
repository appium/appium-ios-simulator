import _ from 'lodash';
import TCCDB from './tcc-db';
import { retryInterval } from 'asyncbox';

const SERVICES = {
  calendar: 'kTCCServiceCalendar',
  camera: 'kTCCServiceCamera',
  contacts: 'kTCCServiceAddressBook',
  homekit: 'kTCCServiceWillow',
  microphone: 'kTCCServiceMicrophone',
  photos: 'kTCCServicePhotos',
  reminders: 'kTCCServiceReminders',
  medialibrary: 'kTCCServiceMediaLibrary',
  motion: 'kTCCServiceMotion',
  health: 'kTCCServiceMSO',
  siri: 'kTCCServiceSiri',
  speech: 'kTCCServiceSpeechRecognition',
};

const STATUS_UNSET = 'unset';
const STATUS_YES = 'yes';
const STATUS_NO = 'no';


function toInternalServiceName (serviceName) {
  if (_.has(SERVICES, _.toLower(serviceName))) {
    return SERVICES[_.toLower(serviceName)];
  }
  throw new Error(`'${serviceName}' is unknown. Only the following service names are supported: ${JSON.stringify(_.keys(SERVICES))}`);
}

function assertStatus (status) {
  const supportedValues = [STATUS_UNSET, STATUS_NO, STATUS_YES];
  if (!supportedValues.includes(status)) {
    throw new Error(`Status value '${status}' is unknown. Only the following values are supported: ${JSON.stringify(supportedValues)}`);
  }
}

class Permissions {

  constructor (xcodeVersion, sharedResourcesDir) {
    this.tccDb = new TCCDB(xcodeVersion, sharedResourcesDir);
  }

  async setAccess (serviceName, bundleId, status) {
    serviceName = toInternalServiceName(serviceName);
    assertStatus(status);

    await retryInterval(15, 2000, async () => {
      await this.tccDb.execQuery(`DELETE FROM 'access' WHERE service='?' AND client='?' AND client_type=?`, serviceName, bundleId, '0');
      if (status !== STATUS_UNSET) {
        await this.tccDb.execQuery(`REPLACE INTO 'access' (service, client, client_type, allowed, prompt_count) VALUES ('?', '?', ?, ?, ?)`,
          serviceName, bundleId, '0', status === STATUS_YES ? '1' : '0', '1');
      }
    });
  }

  async getAccess (serviceName, bundleId) {
    serviceName = toInternalServiceName(serviceName);

    for (const [sqlValue, status] of [['0', STATUS_NO], ['1', STATUS_YES]]) {
      const count = await this.tccDb.execQuery(`SELECT count(*) FROM 'access' WHERE client='?' AND allowed=? AND service='?'`,
        bundleId, sqlValue, serviceName);
      if (parseInt(count.split('=')[1], 10) > 0) {
        return status;
      }
    }
    return STATUS_UNSET;
  }
}

export default Permissions;
export {
  STATUS_UNSET, STATUS_YES, STATUS_NO
};