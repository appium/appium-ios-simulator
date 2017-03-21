import { exec } from 'teen_process';

let touchEnrollMenuKeys = ['Toggle Enrolled State', 'Touch ID Enrolled'];
let touchEnrollBackups;
const NS_USER_KEY_EQUIVALENTS = 'NSUserKeyEquivalents';
const TOUCH_ENROLL_KEY_CODE = '@~$^t';

async function setTouchEnrollKey () {
  await backupTouchEnrollShortcuts();
  for (let key of touchEnrollMenuKeys) {
    await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, TOUCH_ENROLL_KEY_CODE);
  }
}

async function setTouchEnrollKeys (pairs) {
  for (let [key, value] of pairs) {
    await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, value);
  }
}

async function getTouchEnrollKeys () {
  let backups = [];
  for (let key of touchEnrollMenuKeys) {
    backups.push([key, await getUserDefault(NS_USER_KEY_EQUIVALENTS, key)]);
  }
  return backups;
}

/**
 * Get MacOS User Defaults by domain and key (for reference: `man defaults`)
 * @param {*} domain {string}
 * @param {*} key {string|number|boolean}
 */
async function getUserDefault (domain, key) {
  let res;
  try {
    // If it doesn't find anything for this domain, it will throw an error so return undefined
    res = await exec('defaults', ['read', 'Apple Global Domain', domain]);
  } catch (stderr) {
    return;
  }
  let stdout = res.stdout;

  // Parse the result into a Javascript array
  let nsUserKeyArr = stdout.trim()
    .replace(/^{/, '') // Remove leading {
    .replace(/}$/, '') // Remove trailing }
    .trim()
    .replace(/;$/, '') // Remove trailing semicolon
    .split(';') // Break up expressions by semicolon
    .map((expr) => {
      let [key, value] = expr.split('=');
      key = key.trim().replace(/^"/, '').replace(/"$/, '');
      value = value.trim().replace(/^"/, '').replace(/"$/, '');
      return [key, value];
    });

  
  for (let [testKey, value] of nsUserKeyArr) {
    if (testKey === key) {
      return value.replace(/\\\\/g, '\\');
    }
  }
}

/**
 * Sets a MacOS User Default value on a domain
 * @param {*} domain 
 * @param {*} key 
 * @param {*} value 
 */
async function setUserDefault (domain, key, value) {
  await exec('defaults', ['write', 'Apple Global Domain', domain, '-dict-add', key, typeof(value) === 'undefined' ? 'nil' : value]);
}

async function backupTouchEnrollShortcuts () {
  if (!touchEnrollBackups) {
    touchEnrollBackups = await getTouchEnrollKeys();
  }
}

async function restoreTouchEnrollShortcuts () {
  if (touchEnrollBackups) {
    await setTouchEnrollKeys(touchEnrollBackups);
    touchEnrollBackups = undefined;
  }
}

function getTouchEnrollBackups () {
  return touchEnrollBackups;
}

export { setTouchEnrollKey, getTouchEnrollKeys, setTouchEnrollKeys, getUserDefault, setUserDefault, getTouchEnrollBackups,
  touchEnrollMenuKeys, backupTouchEnrollShortcuts, restoreTouchEnrollShortcuts,
  NS_USER_KEY_EQUIVALENTS, TOUCH_ENROLL_KEY_CODE};
