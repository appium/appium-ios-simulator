import sqlite3 from 'sqlite3';
import Promise from 'bluebird';
import fs from 'fs-promise';
import openssl from 'openssl-wrapper';


/*let tset = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n
    <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
    <plist version=\"1.0\">
    <array/>
</plist>`;*/

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
    this.db = new sqlite3.Database(this.sqliteDBPath);
  }

  /**
   * Add a certificate to the TrustStore
   */
  async addCertificate (pemFilename) {
    let data = await Certificate.pemFileToDer(pemFilename);
    //let subject = await Certificate.getSubject(data);
    return data;
  }

  static async pemFileToDer(infileName){
    return new Promise((resolve) => {
      let tempOutFile = `temp-der-file.der`;

      // Convert 'pem' file to 'der'
      openssl('x509', {
        outform: 'der',
        in: infileName,
        out: tempOutFile
      }, async () => { 
        let derText = await fs.readFile(tempOutFile, 'utf-8');
        fs.unlink(tempOutFile);
        resolve(derText);
      });
    });
  }

  static async getFingerPrint (data){
    return data;
  }

  static async getSubject (derData){
    return derData;
  }

  /**
   * Remove certificate from the TrustStore
   */
  async removeCertificate () {

  }

  /**
   * Add record to tsettings
   */
  async addRecord (sha1, tset, subj, data) {
    let existingRecords = await this.getRecords(subj);

    let sqlQuery = existingRecords.length > 0 ?
      `UPDATE tsettings SET sha1='${sha1}', tset='${tset}', data='${data}' WHERE subj='${subj}'`
      : `INSERT INTO tsettings (sha1, subj, tset, data) VALUES ('${sha1}', '${subj}', '${tset}', '${data}')`;

    return new Promise((resolve, reject) => {
      this.db.run(sqlQuery, _promiseCb(resolve, reject));
    });
  }

  /**
   * Remove record from tsettings
   */
  async removeRecord (subj) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM tsettings WHERE subj = '${subj}'`, 
        _promiseCb(resolve, reject)
      );
    });
  }

  /**
   * Get a record from tsettings
   */
  async getRecords (subj) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT sha1, subj, tset, data FROM tsettings WHERE subj = '${subj}'`, 
        _promiseCb(resolve, reject)
      );
    });
  }
}

export default Certificate;