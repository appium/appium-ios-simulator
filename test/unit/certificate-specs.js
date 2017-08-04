// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Certificate, TrustStore } from '../../lib/certificate';
import { fs } from 'appium-support';
import { copySync } from 'fs-extra';
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
let tempDirectory;

describe('when using TrustStore class', () => {

  function getUUID () {
    return uuid.v4().replace(/\-/g, '');
  }

  beforeEach(async () => {
    keychainsDirOriginal = `${assetsDir}/Library/Keychains-Original`;
    await fs.rimraf(keychainsDir);
    copySync(keychainsDirOriginal, keychainsDir);
    trustStore = new TrustStore(assetsDir);
    testUUID = getUUID();
  });

  it('can add a record to the TrustStore tsettings', async () => {
    expect(await trustStore.hasRecords(testUUID)).to.be.false;
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    expect(await trustStore.hasRecords(testUUID)).to.be.true;
  });

  it('can add and remove records to in TrustStore tsettings', async () => {
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    expect(await trustStore.hasRecords(testUUID)).to.be.true;
    await trustStore.removeRecord(testUUID);
    expect(await trustStore.hasRecords(testUUID)).to.be.false;
  });

  it('can update a record in the TrustStore tsettings', async () => {
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '4567');

    expect(await trustStore.getRecordCount(testUUID)).to.equal(1);
  });
});

describe('when using TrustStore class when the keychains directory doesn\'t exist', () => {
  beforeEach(async () => {
    tempDirectory = `${assetsDir}/temp`;
    await fs.rimraf(tempDirectory);
    await fs.mkdir(tempDirectory);
  });

  afterEach(async () => {
    await fs.rimraf(tempDirectory);
  });

  it('will create a new keychains directory with a SQLite DB', async () => {
    let newTrustStore = new TrustStore(tempDirectory);
    await newTrustStore.addRecord('0123', 'test', 'test', '0123');
    expect(await newTrustStore.hasRecords('test')).to.be.true;
  });
});

describe('when using Certificate class', () => {

  beforeEach(async () => {
    certificate = await new Certificate(`${assetsDir}/test-pem.pem`);
  });

  it('can translate PEM certificate to DER format', async () => {
    let derData = await certificate.getDerData();
    let testData = await fs.readFile(`${assetsDir}/Library/certificates/test-data.txt`);
    expect(testData.equals(derData));
  });

  it('can get a fingerprint from a PEM certificate', async () => {
    let fingerprint = await certificate.getFingerPrint();
    let testFingerprint = await fs.readFile(`${assetsDir}/Library/certificates/test-fingerprint.txt`);
    expect(fingerprint.equals(testFingerprint));
  });

  it('can get a subject from a PEM certificate', async () => {
    let subject = await certificate.getSubject(`${assetsDir}/test-pem.pem`);
    let testSubject = await fs.readFile(`${assetsDir}/Library/certificates/test-subj.txt`, 'utf-8');
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
