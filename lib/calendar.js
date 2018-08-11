import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';
import _ from 'lodash';
import log from './logger';


export default class Calendar {

  constructor (xcodeVersion, sharedResourcesDir) {
    this.xcodeVersion = xcodeVersion;
    this.sharedResourcesDir = sharedResourcesDir;
  }

  async getDB () {
    if (this.db) {
      return this.db;
    }

    const tccPath = path.resolve(this.sharedResourcesDir, 'Library', 'TCC');
    if (!(await fs.exists(tccPath))) {
      await mkdirp(tccPath);
    }

    this.db = path.resolve(tccPath, 'TCC.db');
    await execSQLiteQuery(this.db, `CREATE TABLE IF NOT EXISTS access (
      service TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      client_type INTEGER,
      allowed INTEGER,
      prompt_count INTEGER,
      csreq BLOB NOT NULL DEFAULT '',
      policy_ID INTEGER,
      PRIMARY KEY(service, client, client_type)
    );`.replace(/\n/g, ''));

    return this.db;
  }

  async getCalendarRowCount (bundleID) {
    const db = await this.getDB();
    const count = await execSQLiteQuery(db, `SELECT count(*) FROM access WHERE client='?' AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.stdout.split('=')[1], 10);
  }

  async hasCalendarAccess (bundleID) {
    const count = await execSQLiteQuery(await this.getDB(), `SELECT count(*) FROM access WHERE client='?' AND allowed=1 AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.stdout.split('=')[1], 10) > 0;
  }

  async enableCalendarAccess (bundleID) {
    const db = await this.getDB();

    let query;
    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      query = `UPDATE 'access' SET
        service='kTCCServiceCalendar',
        client_type=0,
        allowed=1,
        prompt_count=1,
        csreq=0
      WHERE client='?' AND service='kTCCServiceCalendar'`.replace(/\n/g, ' ');
    } else {
      let count = this.columnCount;
      if (!_.isNumber(this.columnCount)) {
        try {
          const {stdout} = await execSQLiteQuery(db, `pragma table_info('access')`);
          // stdout has a number of records, each starting with `cid`
          //       cid = 0
          //       name = service
          //       type = TEXT
          //       notnull = 1
          //       dflt_value =
          //       pk = 1
          //
          //       cid = 1
          //       name = client
          //       type = TEXT
          //       notnull = 1
          //       dflt_value =
          //       pk = 2
          count = this.columnCount =
            stdout
              .trim()
              // get each record's beginning
              .split('cid')
              // remove the empty row (usually, the first)
              .filter((record) => !_.isEmpty(record))
              .length;
        } catch (err) {
          // use defaults, but do not save
          count = this.xcodeVersion.major < 10 ? 7 : 11;
          log.warn(`Unable to find Calendar access column count: ${err.message}`);
        }
      }

      // fill in the query with 0's for columns after the 5 we care about
      query = `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '?', 0, 1, 1, ${_.range(0, count - 5, 0).join(', ')});`;
    }
    await execSQLiteQuery(db, query, bundleID);
  }

  async disableCalendarAccess (bundleID) {
    const db = await this.getDB();

    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      await execSQLiteQuery(db, `DELETE FROM 'access' WHERE client='?' AND service='kTCCServiceCalendar'`.replace(/\n/g, ' '), bundleID);
    }
  }
}
