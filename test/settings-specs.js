// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import B from 'bluebird';
import { update } from '../lib/settings.js';
import bplistParser from 'bplist-parser';
import path from 'path';
import { tempDir, fs } from 'appium-support';
import ncp from 'ncp';

let parseFile = B.promisify(bplistParser.parseFile);
let copy = B.promisify(ncp.ncp);

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
    let temp = await tempDir.path();
    tmpPlist = path.resolve(temp, 'sample.plist');
    await copy(plist, tmpPlist);
  });

  afterEach(async () => {
    await fs.unlink(tmpPlist);
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
