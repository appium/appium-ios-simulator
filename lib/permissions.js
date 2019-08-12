import _ from 'lodash';
import { fs } from 'appium-support';
import { exec } from 'teen_process';
import log from './logger';
import TCCDB from './tcc-db';
import { quote } from 'shell-quote';

const STATUS_UNSET = 'unset';
const STATUS_YES = 'yes';
const STATUS_NO = 'no';
const WIX_SIM_UTILS = 'applesimutils';
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
    await fs.which(WIX_SIM_UTILS);
  } catch (e) {
    throw new Error(`${WIX_SIM_UTILS} binary has not been found in your PATH. ` +
      `Please install it ('brew tap wix/brew && brew install wix/brew/applesimutils') to ` +
      `be able to change application permissions`);
  }

  log.debug(`Executing: ${WIX_SIM_UTILS} ${quote(args)}`);
  try {
    const {stdout} = await exec(WIX_SIM_UTILS, args);
    log.debug(`Command output: ${stdout}`);
    return stdout;
  } catch (e) {
    throw new Error(`Cannot execute "${WIX_SIM_UTILS} ${quote(args)}". Original error: ${e.stderr || e.message}`);
  }
}

class Permissions {
  constructor (xcodeVersion, sharedResourcesDir, udid) {
    this.tccDb = new TCCDB(xcodeVersion, sharedResourcesDir);
    this.udid = udid;
  }

  /**
   * Sets permissions for the given application
   *
   * @param {string} bundleId - bundle identifier of the target application.
   * @param {Object} permissionsMapping - An object, where keys ar  service names
   * and values are corresponding state values. See https://github.com/wix/AppleSimulatorUtils
   * for more details on available service names and statuses.
   * @throws {Error} If there was an error while changing permissions.
   */
  async setAccess (bundleId, permissionsMapping) {
    const permissionsArg = _.toPairs(permissionsMapping)
      .map((x) => `${x[0]}=${formatStatus(x[1])}`)
      .join(',');
    return await execWix([
      '--byId', this.udid,
      '--bundle', bundleId,
      '--setPermissions', permissionsArg,
    ]);
  }

  /**
   * Retrieves the current permission status for the given service and application.
   *
   * @param {string} bundleId - bundle identifier of the target application.
   * @param {string} serviceName - the name of the service. Should be one of
   * `SERVICES` keys.
   * @returns {string} - The current status: yes/no/unset
   * @throws {Error} If there was an error while retrieving permissions.
   */
  async getAccess (bundleId, serviceName) {
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
