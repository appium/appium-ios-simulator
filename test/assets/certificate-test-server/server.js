/* eslint-disable */
/* jshint ignore:start */
import https from 'https';
import pem from 'pem';
import fs from 'fs';
import inquirer from 'inquirer';
import colors from 'colors';
import Certificate from '../../../lib/certificate';
import { getDevices } from 'node-simctl';
import _ from 'lodash';

// Create an HTTPS server with a randomly generated certificate
pem.createPrivateKey(function (err, key){ 
  pem.createCertificate({days:1, selfSigned: true, serviceKey: key.key},  async (err, keys) => {

    // Save that certificate to a file so it can be used later
    fs.writeFileSync('random-pem.pem', keys.certificate);
    let server = https.createServer({key: keys.serviceKey, cert: keys.certificate}, function (req, res){
      res.end('If you are seeing this the certificate has been installed');
    }).listen(9758);

    console.log('Make sure you have at least one IOS Simulator running'.yellow);
    let devices = await getDevices();

    // Get currently booted devices
    let bootedDevices = [];
    _.forEach(devices, (os) => {
      os.forEach((device) => {
        if(device.state === 'Booted'){
          bootedDevices.push(device);
        }
      });
    });

    if(bootedDevices.length === 0) {
      return console.log('You must have at least one IOS Simulator running to do this test'.red);
    }

    // Get info for first device
    let bootedDevice = bootedDevices[0];
    let udid = bootedDevice.udid;
    let deviceName = bootedDevice.name;

    console.log('HTTPS server is running at localhost:9758 and has created a new certificate at "random-pem.pem"'.yellow);  
    console.log(`Navigate to https://localhost:9758 in '${deviceName} Simulator' to confirm that you cannot open the page`.yellow);
    console.log('DO NOT PUSH THE CONTINUE BUTTON. PUSH CANCEL.'.red);
    
    function done(){
      if(certificate)
        certificate.remove(dir);
      server.close();
      console.log('Incomplete/failed test'.red);
    }

    let result = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmOpenSite',
      message: `Have you attempted to open https//localhost:9758 in '${deviceName} Simulator' and it failed?`,
    }]);

    if (!result.confirmOpenSite) return done();

    result = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmInstallCert',
      message: `Are you ready to install the certificate to '${deviceName} Simulator'?`,
    }]);

    if (!result.confirmInstallCert) return done();

    // Apply certificate to 
    let pemFile = 'random-pem.pem';
    let dir = `${process.env.HOME}/Library/Developer/CoreSimulator/Devices/${udid}/data/`;
    console.log('Installing certificate'.yellow);
    let certificate = new Certificate(pemFile);
    certificate.add(dir);
    console.log(`Certificate installed to '${deviceName} ${udid}'. Navigate back to https://localhost:9758 to confirm that it can be opened.`.yellow);

    result = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmOpenedSite',
      message: 'Are you able to access https://localhost:9758? now?',
    }]);

    if(result.confirmOpenedSite){
      console.log('Test passed'.green);
    }
    
    certificate.remove(dir);
    return server.close();
  });
});

/* jshint ignore:end */
/* eslint-enable */