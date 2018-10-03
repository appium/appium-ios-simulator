/* eslint-disable no-console */
import https from 'https';
import inquirer from 'inquirer';
import { installSSLCert, uninstallSSLCert } from '../../../lib/utils';
import { getDevices } from 'node-simctl';
import B from 'bluebird';
import 'colors';

const pem = B.promisifyAll(require('pem'));

(async () => {

  // Create an HTTPS server with a randomly generated certificate
  let key = await pem.createPrivateKeyAsync();
  let keys = await pem.createCertificateAsync({days: 1, selfSigned: true, serviceKey: key.key});

  let server = https.createServer({key: keys.serviceKey, cert: keys.certificate}, function (req, res) {
    res.end('If you are seeing this the certificate has been installed');
  }).listen(9758);

  console.log('Make sure you have at least one IOS Simulator running'.yellow);
  let devices = await getDevices();

  // Get currently booted devices
  let bootedDevices = [];
  for (let osName in devices) {
    let os = devices[osName];
    for (let deviceName in os) {
      let device = os[deviceName];
      if (device.state === 'Booted') {
        bootedDevices.push(device);
      }
    }
  }

  if (bootedDevices.length === 0) {
    return console.log('You must have at least one IOS Simulator running to do this test'.red);
  }

  // Get info for first device
  let bootedDevice = bootedDevices[0];
  let udid = bootedDevice.udid;
  let deviceName = bootedDevice.name;
  console.log(`Using bootedDevice ${udid}`);

  console.log('HTTPS server is running at localhost:9758 and has created a new certificate at "random-pem.pem"'.yellow);
  console.log(`Navigate to https://localhost:9758 in '${deviceName} Simulator'`.yellow);
  console.log('DO NOT PUSH THE CONTINUE BUTTON. PUSH CANCEL.'.red);

  // Call this if the user answers 'No' to any prompts
  async function done () {
    await uninstallSSLCert(keys.certificate, udid);
    server.close();
    console.log('Incomplete/failed test'.red);
  }

  let result = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmOpenSite',
    message: `Is https//localhost:9758 on '${deviceName} Simulator' unaccessible?`,
  }]);

  console.log('Certificate', keys.certificate, udid);

  await installSSLCert(keys.certificate, udid);

  if (!result.confirmOpenSite) return done(); // eslint-disable-line curly

  // Apply certificate to Simulator
  console.log('Installing certificate'.yellow);
  console.log(`Certificate installed to '${deviceName} ${udid}'. Navigate back to https://localhost:9758.`.yellow);

  result = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmOpenedSite',
    message: 'Now is https://localhost:9758 accessible?',
  }]);

  if (!result.confirmOpenedSite) {
    return done();
  }

  // Uninstall cert
  console.log(`Uninstalling SSL cert`.yellow);
  await uninstallSSLCert(keys.certificate, udid);
  console.log(`SSL cert removed.`.yellow);
  console.log(`Close the simulator, re-open it and then navigate back to https://localhost:9758`.yellow);

  result = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmUninstallCert',
    message: `Is https://localhost:9758 unaccessible?`,
  }]);

  if (result.confirmUninstallCert) {
    console.log('Test passed'.green);
  }

  return server.close();
})();
