// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Certificate, TrustStore } from '../../lib/certificate';
import fse from 'fs-extra';
import uuid from 'uuid';

chai.should();
chai.use(chaiAsPromised);


let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let keychainsDir = `${assetsDir}/Library/Keychains`;
let keychainsDirOriginal;

describe('when using Certificate class', () => { 

  beforeEach(() => {
    keychainsDirOriginal = `${assetsDir}/Library/Keychains-Original`;
    fse.emptyDirSync(keychainsDir);
    fse.copySync(keychainsDirOriginal, keychainsDir); 
  });

  it('can add a record to the TrustStore tsettings', async () => {
    let trustStore = new TrustStore(assetsDir);
    let testUUID = uuid.v4();
    let tsettings = await trustStore.getRecords(testUUID); 
    chai.assert(tsettings.length===0);
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    tsettings = await trustStore.getRecords(testUUID); 
    chai.assert(tsettings.length > 0);
    chai.assert.equal(tsettings[0].subj, testUUID);
  });

  it('can add and remove records to in TrustStore tsettings', async () => {
    let trustStore = new TrustStore(assetsDir);
    let testUUID = uuid.v4();
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    let tsettings = await trustStore.getRecords(testUUID);
    chai.assert(tsettings.length > 0);
    await trustStore.removeRecord(testUUID);
    tsettings = await trustStore.getRecords(testUUID);
    chai.assert(tsettings.length === 0); 
  });

  it('can update a record in the TrustStore tsettings', async () => {
    let trustStore = new TrustStore(assetsDir);
    let testUUID = uuid.v4();
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data1');
    let tsettings = await trustStore.getRecords(testUUID);
    chai.assert.equal(tsettings[0].data, 'data1');
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data2');
    tsettings = await trustStore.getRecords(testUUID) ;
    chai.assert.equal(tsettings[0].data, 'data2');  
  });

  it('can translate PEM certificate to DER format', async () => {
    let derData = await Certificate.pemFileToDer(`${assetsDir}/test-pem.pem`);
    let testData = fse.readFileSync(`${assetsDir}/Library/certificates/test-data.txt`);
    chai.assert(testData.equals(derData), 'not translating PEM to DER correctly'); 
  });
 
  it('can get a fingerprint from a PEM certificate', async () => {
    let derData = await Certificate.pemFileToDer(`${assetsDir}/test-pem.pem`);
    let fingerprint = Certificate.getFingerPrint(derData);
    let testFingerprint = fse.readFileSync(`${assetsDir}/Library/certificates/test-fingerprint.txt`);
    chai.assert(fingerprint.equals(testFingerprint));   
  });

  /*it('can get a subject from a PEM certificate', async () => {
    let subject = await Certificate.getSubject(`${assetsDir}/test-pem.pem`);
    let testSubject = fse.readFileSync(`${assetsDir}/Library/certificates/test-subj.txt`, 'utf-8');
    chai.assert.equal(subject, testSubject);
  });*/

  it('can add a certificate to a sqlite store', async () => {  
    let certificate = new Certificate(`${assetsDir}/test-pem.pem`); 
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    chai.assert(hasCert, 'after adding a cert, should have one cert in records');
  });  
});