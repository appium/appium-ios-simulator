// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Certificate, TrustStore } from '../../lib/certificate';
import { fs, util } from '@appium/support';
import { copySync } from 'fs-extra';

chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

const cwd = process.cwd();
const assetsDir = `${cwd}/test/assets`;
const keychainsDir = `${assetsDir}/Library/Keychains`;
let keychainsDirOriginal;
let certificate;
let trustStore;
let testUUID;
let tempDirectory;

describe('when using TrustStore class', function () {

  function getUUID () {
    return util.uuidV4().replace(/-/g, '');
  }

  beforeEach(async function () {
    keychainsDirOriginal = `${assetsDir}/Library/Keychains-Original`;
    await fs.rimraf(keychainsDir);
    copySync(keychainsDirOriginal, keychainsDir);
    trustStore = new TrustStore(assetsDir);
    testUUID = getUUID();
  });

  it('can add a record to the TrustStore tsettings', async function () {
    expect(await trustStore.hasRecords(testUUID)).to.be.false;
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    expect(await trustStore.hasRecords(testUUID)).to.be.true;
  });

  it('can add and remove records to in TrustStore tsettings', async function () {
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    expect(await trustStore.hasRecords(testUUID)).to.be.true;
    await trustStore.removeRecord(testUUID);
    expect(await trustStore.hasRecords(testUUID)).to.be.false;
  });

  it('can update a record in the TrustStore tsettings', async function () {
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '0123');
    await trustStore.addRecord(getUUID(), 'tset', testUUID, '4567');

    expect(await trustStore.getRecordCount(testUUID)).to.equal(1);
  });
});

describe('when using TrustStore class when the keychains directory doesn\'t exist', function () {
  beforeEach(async function () {
    tempDirectory = `${assetsDir}/temp`;
    await fs.rimraf(tempDirectory);
    await fs.mkdir(tempDirectory);
  });

  afterEach(async function () {
    await fs.rimraf(tempDirectory);
  });

  it('will create a new keychains directory with a SQLite DB', async function () {
    let newTrustStore = new TrustStore(tempDirectory);
    await newTrustStore.addRecord('0123', 'test', 'test', '0123');
    expect(await newTrustStore.hasRecords('test')).to.be.true;
  });
});

describe('when using Certificate class', function () {

  beforeEach(async function () {
    certificate = await new Certificate(`${assetsDir}/test-pem.pem`);
  });

  afterEach(async function () {
    await certificate.remove(assetsDir);
  });

  it('can translate PEM certificate to DER format', async function () {
    let derData = await certificate.getDerData();
    let testData = await fs.readFile(`${assetsDir}/Library/certificates/test-data.txt`);
    expect(testData.equals(derData));
  });

  it('can get a fingerprint from a PEM certificate', async function () {
    let fingerprint = await certificate.getFingerPrint();
    let testFingerprint = await fs.readFile(`${assetsDir}/Library/certificates/test-fingerprint.txt`);
    expect(fingerprint.equals(testFingerprint));
  });

  it('can get a subject from a PEM certificate', async function () {
    let subject = await certificate.getSubject(`${assetsDir}/test-pem.pem`);
    expect(subject.length).to.be.greaterThan(0);
  });

  it('can add a certificate to a sqlite store', async function () {
    await certificate.has(assetsDir).should.eventually.be.false;
    await certificate.add(assetsDir);
    await certificate.has(assetsDir).should.eventually.be.true;
  });

  it('can add and remove a certificate to a sqlite store', async function () {
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    expect(hasCert);
    await certificate.remove(assetsDir);
    hasCert = await certificate.has(assetsDir);
    expect(!hasCert);
  });

  it('can add a certificate and then remove the same certificate later', async function () {
    await certificate.add(assetsDir);
    let hasCert = await certificate.has(assetsDir);
    expect(hasCert);

    certificate = new Certificate(`${assetsDir}/test-pem.pem`);
    await certificate.remove(assetsDir);
    hasCert = await certificate.has(assetsDir);
    expect(!hasCert);
  });
});
