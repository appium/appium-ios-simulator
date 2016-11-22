// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Certificate, TrustStore } from '../../lib/certificate';
import fse from 'fs-extra';
import uuid from 'uuid';

chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let keychainsDir = `${assetsDir}/Library/Keychains`;
let keychainsDirOriginal;
let certificate;
let trustStore;
let testUUID;

describe('when using TrustStore class', () => { 

  beforeEach(() => {
    keychainsDirOriginal = `${assetsDir}/Library/Keychains-Original`;
    fse.emptyDirSync(keychainsDir);
    fse.copySync(keychainsDirOriginal, keychainsDir); 
    trustStore = new TrustStore(assetsDir);
    testUUID = uuid.v4();
  });

  it('can add a record to the TrustStore tsettings', async () => {
    let tsettings = await trustStore.getRecords(testUUID);
    expect(tsettings).to.have.length.of(0);
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    tsettings = await trustStore.getRecords(testUUID); 
    expect(tsettings).to.have.length.above(0);
    tsettings[0].subj.should.equal(testUUID);
  });

  it('can add and remove records to in TrustStore tsettings', async () => {
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data');
    let tsettings = await trustStore.getRecords(testUUID);
    expect(tsettings).to.have.length.above(0);
    await trustStore.removeRecord(testUUID);
    tsettings = await trustStore.getRecords(testUUID);
    expect(tsettings).to.have.length(0); 
  });

  it('can update a record in the TrustStore tsettings', async () => {
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data1');
    let tsettings = await trustStore.getRecords(testUUID);
    expect(tsettings[0].data).to.equal('data1');
    await trustStore.addRecord(uuid.v4(), 'tset', testUUID, 'data2');
    tsettings = await trustStore.getRecords(testUUID);
    expect(tsettings[0].data).to.equal('data2');  
  });
});

describe('when using Certificate class', () => { 

  beforeEach(async () => {
    certificate = await new Certificate(`${assetsDir}/test-pem.pem`);
  });

  it('can translate PEM certificate to DER format', async () => {
    let derData = await certificate.getDerData();
    let testData = fse.readFileSync(`${assetsDir}/Library/certificates/test-data.txt`);
    expect(testData.equals(derData)); 
  });
 
  it('can get a fingerprint from a PEM certificate', async () => {
    let fingerprint = await certificate.getFingerPrint();
    let testFingerprint = fse.readFileSync(`${assetsDir}/Library/certificates/test-fingerprint.txt`);
    expect(fingerprint.equals(testFingerprint));   
  });

  it('can get a subject from a PEM certificate', async () => {
    let subject = await certificate.getSubject(`${assetsDir}/test-pem.pem`);
    let testSubject = fse.readFileSync(`${assetsDir}/Library/certificates/test-subj.txt`, 'utf-8');
    expect(subject).to.equal(testSubject);
  });

  it('can add a certificate to a sqlite store', async () => {
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    expect(hasCert);
  });  

  it('can add and remove a certificate to a sqlite store', async () => {
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    expect(hasCert);
    await certificate.remove(assetsDir);
    hasCert = await certificate.has(assetsDir);
    expect(!hasCert);
  });

  it('can add a certificate and then remove the same certificate later', async () => {
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    expect(hasCert);

    certificate = new Certificate(`${assetsDir}/test-pem.pem`);
    await certificate.remove(assetsDir);
    hasCert = await certificate.has(assetsDir);
    expect(!hasCert);
  });
});