// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getCalendarDB } from '../../lib/calendar';
import { fs } from 'appium-support';
import { copySync } from 'fs-extra';
import { execSQLiteQuery } from '../../lib/utils';

chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let tccDir = `${assetsDir}/Library/TCC`;
let tccDirOriginal = `${assetsDir}/Library/TCC-Original`;

describe.only('Calendar methods', () => {

  beforeEach(async () => {
    await fs.rimraf(tccDir);
    copySync(tccDirOriginal, tccDir);
  });

  after(async () => {
    await fs.rimraf(tccDir);
  });

  describe('getCalendarDB()', () => {

    it('creates a new DB with a table named "access" if none existed in the first place', async () => {
      await fs.rimraf(tccDir);
      expect(await fs.exists(tccDir)).to.be.false;
      let db = await getCalendarDB(tccDir);
      expect(await fs.exists(tccDir)).to.be.true;
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access`);
      let count = parseInt(res.stdout.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });

    it('doesn\'t overwrite DB if one already exists', async () => {
      let db = await getCalendarDB(tccDir);
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access`);
      let count = parseInt(res.stdout.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });
  });
});
