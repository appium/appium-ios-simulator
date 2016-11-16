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
    await certificate.addRecord('sha1', 'tset', testUUID, 'data');
    let setting = await certificate.getRecord(testUUID);
    chai.assert(setting.subj === testUUID);
  });
});