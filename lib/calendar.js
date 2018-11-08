import _ from 'lodash';
import log from './logger';
import TCCDB from './tcc-db';


class Calendar {

  constructor (xcodeVersion, sharedResourcesDir) {
    this.xcodeVersion = xcodeVersion;
    this.tccDb = new TCCDB(xcodeVersion, sharedResourcesDir);
  }

  async getCalendarRowCount (bundleID) {
    const count = await this.tccDb.execQuery(`SELECT count(*) FROM access WHERE client='?' AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.split('=')[1], 10);
  }

  async hasCalendarAccess (bundleID) {
    const count = await this.tccDb.execQuery(`SELECT count(*) FROM access WHERE client='?' AND allowed=1 AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.split('=')[1], 10) > 0;
  }

  async enableCalendarAccess (bundleID) {
    let query;
    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      query = `UPDATE 'access' SET
        service='kTCCServiceCalendar',
        client_type=0,
        allowed=1,
        prompt_count=1,
        csreq=0
      WHERE client='?' AND service='kTCCServiceCalendar'`;
    } else {
      let count = this.columnCount;
      if (!_.isNumber(this.columnCount)) {
        try {
          const stdout = await this.tccDb.execQuery(`pragma table_info('access')`);
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
    await this.tccDb.execQuery(query, bundleID);
  }

  async disableCalendarAccess (bundleID) {
    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      await this.tccDb.execQuery(`DELETE FROM 'access' WHERE client='?' AND service='kTCCServiceCalendar'`, bundleID);
    }
  }
}

export default Calendar;