// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import B from 'bluebird';
import { update } from '../lib/settings.js';
import bplistParser from 'bplist-parser';
import path from 'path';
import { tempDir } from 'appium-support';
import ncp from 'ncp';
import fs from 'fs';

let parseFile = B.promisify(bplistParser.parseFile);
let copy = B.promisify(ncp.ncp);
let del = B.promisify(fs.unlink);
const plist = path.resolve('test/assets/sample.plist');
// plist asset looks like this:
// [ { 'com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework':
//      { Whitelisted: false,
//        Executable: '',
//        BundlePath: '/System/Library/PrivateFrameworks/Parsec.framework',
//        Registered: '' },
//     'com.apple.locationd.bundle-/System/Library/PrivateFrameworks/WirelessDiagnostics.framework':
//      { Whitelisted: false,
//        Executable: '',
//        BundlePath: '/System/Library/PrivateFrameworks/WirelessDiagnostics.framework',
//        Registered: '' } } ]


/*let should =*/ chai.should();
chai.use(chaiAsPromised);

describe('settings', () => {

  let tmpPlist;

  beforeEach(async () => {
    let temp = tempDir.path();
    tmpPlist = path.resolve(temp, 'sample.plist');
    await copy(plist, tmpPlist);
  });

  afterEach(async () => {
    del(tmpPlist);
  });

  it('should update a plist', async () => {

    let originalData = await parseFile(tmpPlist);
    originalData[0]['com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework'].Whitelisted = true;
    await update(tmpPlist, originalData);
    let updatedData = await parseFile(tmpPlist);

    updatedData[0]['com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework'].Whitelisted
    .should.be.true;

    JSON.stringify(originalData).should.equal(JSON.stringify(updatedData));
  });
});
