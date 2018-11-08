import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';

class TCCDB {
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
    );`);

    return this.db;
  }

  async execQuery (query, ...params) {
    return await execSQLiteQuery(await this.getDB(), query, ...params);
  }
}

export default TCCDB;
