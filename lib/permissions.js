import _ from 'lodash';
import { fs } from 'appium-support';
import { exec } from 'teen_process';
import log from './logger';
import TCCDB from './tcc-db';

const STATUS_UNSET = 'unset';
const STATUS_YES = 'yes';
const STATUS_NO = 'no';
const WIX = 'applesimutils';
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

function toInternalServiceName (serviceName) {
  if (_.has(SERVICES, _.toLower(serviceName))) {
    return SERVICES[_.toLower(serviceName)];
  }
  throw new Error(`'${serviceName}' is unknown. Only the following service names are supported: ${JSON.stringify(_.keys(SERVICES))}`);
}

function formatStatus (status) {
  return [STATUS_UNSET, STATUS_NO].includes(status) ? _.toUpper(status) : status;
}

async function execWix (args) {
  try {
    await fs.which(WIX);
  } catch (e) {
    throw new Error(`${WIX} binary has not been found in your PATH. ` +
      `Please install it ('brew tap wix/brew && brew install wix/brew/applesimutils') to ` +
      `be able to change application permissions`);
  }

  log.debug(`Executing ${WIX} with arguments ${JSON.stringify(args)}`);
  try {
    return (await exec(WIX, args)).stdout;
  } catch (e) {
    throw new Error(`Cannot execute ${WIX} with arguments ${JSON.stringify(args)}. ` +
      `Original error: ${e.stderr || e.message}`);
  }
}

class Permissions {
  constructor (xcodeVersion, sharedResourcesDir, udid) {
    this.tccDb = new TCCDB(xcodeVersion, sharedResourcesDir);
    this.udid = udid;
  }

  async setAccess (permissionsMapping, bundleId) {
    const permissionsArg = _.toPairs(permissionsMapping)
      .map((x) => `${x[0]}=${formatStatus(x[1])}`)
      .join(',');
    return await execWix([
      '--byId', this.udid,
      '--bundle', bundleId,
      '--setPermissions', permissionsArg,
    ]);
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