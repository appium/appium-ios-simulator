import appExtensions from './applications';
import safariExtensions from './safari';
import keychainExtensions from './keychain';
import gelolocationExtensions from './geolocation';
import settingsExtensions from './settings';
import biometricExtensions from './biometric';
import permissionsExtensions from './permissions';
import miscExtensions from './misc';

const extensions = {};

const allExtensions = [
  appExtensions,
  safariExtensions,
  keychainExtensions,
  gelolocationExtensions,
  settingsExtensions,
  biometricExtensions,
  permissionsExtensions,
  miscExtensions,
  // add new extensions here
];
for (const ext of allExtensions) {
  Object.assign(extensions, ext);
}

export default extensions;
