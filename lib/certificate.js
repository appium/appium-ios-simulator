import sqlite3 from 'sqlite3';
import Promise from 'bluebird';

let tset = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n
    <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
    <plist version=\"1.0\">
    <array/>
</plist>`;

let _promiseCb = (resolve, reject) => {
  return (err, result) => {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  };
};

class Certificate {

  constructor (iphoneSharedResourcesDir) {
    this.sqliteDBPath = iphoneSharedResourcesDir + '/Library/Keychains/TrustStore.sqlite3';
    sqlite3.verbose();
    this.db = new sqlite3.Database(this.sqliteDBPath);
  }

    /**
     * Add a certificate to the TrustStore
     */
  async addCertificate (/*filename*/) {
    let sha1 = 'sha1';
    let subj = 'subj';
    let data = 'data';
    return this.addRecord(sha1, tset, subj, data);
  }

    /**
     * Remove certificate from the TrustStore
     */
  async removeCertificate (/*filename*/) {

  }

    /**
     * Add record to tsettings
     */
  async addRecord (sha1, tset, subj, data) {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO tsettings (sha1, subj, tset, data) VALUES (   
                '${sha1}',
                '${subj}',
                '${tset}',
                '${data}'
            )`, _promiseCb(resolve, reject)
        );
    });
  }

    /**
     * Remove record from tsettings
     */
  async removeRecord (subj) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM tsettings WHERE subj = '${subj}'`, _promiseCb(resolve, reject));
    });
  }

    /**
     * Get a record from tsettings
     */
  async getRecords (subj) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT sha1, subj, tset, data 
                FROM tsettings
                WHERE subj = '${subj}'
            `, _promiseCb(resolve, reject));
    });
  }
}

export default Certificate;