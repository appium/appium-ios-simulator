/* jshint ignore:start */
var https =  require('https');
var pem =  require('pem');
var fs = require('fs');
var inquirer = require('inquirer');
var Certificate = require('../../../lib/certificate').Certificate;


// Create an HTTPS server with a randomly generated certificate
pem.createPrivateKey(function (err, key){ 
  pem.createCertificate({days:1, selfSigned: true, serviceKey: key.key},  async (err, keys) => {
    // Save that certificate to a file so it can be used later
    fs.writeFileSync('random-pem.pem', keys.certificate);
    https.createServer({key: keys.serviceKey, cert: keys.certificate}, function (req, res){
      res.end('If you are seeing this the certificate has been installed');
    }).listen(9758);
    console.log('HTTPS server is running at localhost:9758 and has created a new certificate at "random-pem.pem"');  
    console.log('Navigate to https://localhost:9758 in your IOS Simulator to confirm that you cannot open the page');
    console.warn('DO NOT ACCEPT THE CERTIFICATE.');
    
    let result = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmOpenSite',
      message: 'Once you have done so press Y',
    }]);

    if (!result) return;

    result = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmInstallCert',
      message: 'Type Y to install the certificate on the IOS Simulator',
    }]);

    if (!result) return;

    let pemFile = 'random-pem.pem';
    let uuid = '41B9C55C-A262-4DD4-A06C-7A95E68868CD';
    let dir = `/Users/danielgraham/Library/Developer/CoreSimulator/Devices/${uuid}/data/`;
    (new Certificate(pemFile)).add(dir);
    console.log(`Certificate installed to ${uuid}. Navigate back to https://localhost:9758 in your browser to confirm that it can be opened.`);

  });
});


/* jshint ignore:end */