// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
//import sinon from 'sinon';
//import * as nodeSimctl from 'node-simctl';
//import { devices } from '../assets/deviceList';
//import { getAllUdids } from '../../lib/extensions/isolate-sim.js';
import Certificate from '../../lib/certificate';
import fse from 'fs-extra';
import uuid from 'uuid';

chai.should();
chai.use(chaiAsPromised);


let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let keychainsDir = `${assetsDir}/Library/Keychains`;
let keychainsDirOriginal;

describe('when using Certificate class', () => { 

  before(() => {
    keychainsDirOriginal = `${assetsDir}/Library/Keychains-Original`;
    fse.emptyDirSync(keychainsDir);
    fse.copySync(keychainsDirOriginal, keychainsDir); 
  });

  it('can add a record to the TrustStore tsettings', async () => {
    let certificate = new Certificate(assetsDir);
    let testUUID = uuid.v4();
    await certificate.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    let tsettings = await certificate.getRecords(testUUID);
    chai.assert(tsettings.length > 0);
    chai.assert(tsettings[0].subj === testUUID);
  });

  it('can add and remove records to in TrustStore tsettings', async () => {
    let certificate = new Certificate(assetsDir);
    let testUUID = uuid.v4();
    await certificate.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    let tsettings = await certificate.getRecords(testUUID);
    chai.assert(tsettings.length > 0);
    await certificate.removeRecord(testUUID);
    tsettings = await certificate.getRecords(testUUID);
    chai.assert(tsettings.length === 0); 
  });

  it('can update a record in the TrustStore tsettings', async () => {
    let certificate = new Certificate(assetsDir);
    let testUUID = uuid.v4();
    await certificate.addRecord(uuid.v4(), 'tset', testUUID, 'data1');
    let tsettings = await certificate.getRecords(testUUID);
    chai.assert(tsettings[0].data === 'data1');
    await certificate.addRecord(uuid.v4(), 'tset', testUUID, 'data2');
    tsettings = await certificate.getRecords(testUUID);
    chai.assert(tsettings[0].data === 'data2');  
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

  it('can get a subject from a PEM certificate', async () => {

  });
});