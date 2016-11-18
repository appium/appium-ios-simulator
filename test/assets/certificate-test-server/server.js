var https =  require('https');
var pem =  require('pem');
var fs = require('fs');
var uuid = require('uuid');

// Create an HTTPS server with a randomly generated certificate
pem.createPrivateKey(function(err, key){ 
    pem.createCertificate({days:1, selfSigned: true, serviceKey: key.key}, function(err, keys){
        // Save that certificate to a file so it can be used later
        fs.writeFileSync('random-pem.pem', keys.certificate);
        https.createServer({key: keys.serviceKey, cert: keys.certificate}, function(req, res){
            res.end('If you are seeing this the certificate has been installed');
        }).listen(9758);
        console.log('Hosting server at port', 9758);
    });
});

