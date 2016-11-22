import crypto from 'crypto';
import B from 'bluebird';
import path from 'path';

const sqlite3 = B.promisifyAll(require('sqlite3'));
const openssl = B.promisify(require('openssl-wrapper').exec);

let tset = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n
    <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
    <plist version=\"1.0\">
    <array/>
</plist>`;

/**
 * Library for programatically adding certificates 
 */
class Certificate {

  constructor (pemFilename) { 
    this.pemFilename = pemFilename;
  }

  /**
   * Add a certificate to the TrustStore
   */
  async add (dir) {
    let data = await this.getDerData(this.pemFilename);
    let subject = await this.getSubject(this.pemFilename);
    let fingerprint = await this.getFingerPrint(this.data);

    let trustStore = new TrustStore(dir);
    return trustStore.addRecord(fingerprint, tset, subject, data);
  }

  /**
   * Checks if keychain at given directory has this certificate
   */
  async has (dir) {
    let subject = await this.getSubject(this.pemFilename);

    let trustStore = new TrustStore(dir);
    let records = await trustStore.getRecords(subject);
    return records.length > 0;
  }

  /**
   * Remove certificate from the TrustStore
   */
  async remove (dir) { 
    let subject = await this.getSubject(this.pemFilename);
    let trustStore = new TrustStore(dir);
    return trustStore.removeRecord(subject);
  }

  /**
   * Translate PEM file to DER buffer
   */
  async getDerData () {
    if (this.data) {
      return this.data;
    }

    // Convert 'pem' file to 'der'
    this.data = await openssl('x509', { 
      outform: 'der',
      in: this.pemFilename
    });

    return this.data;
  }

  /**
   * Get SHA1 fingerprint from der data before
   */
  async getFingerPrint () {
    if (this.fingerprint) {
      return this.fingerprint;
    }

    let data = await this.getDerData();
    let shasum = crypto.createHash('sha1');
    shasum.update(data);
    this.fingerprint = shasum.digest();
    return this.fingerprint;
  }

  /**
   * Parse the subject from the der data
   */
  async getSubject () {
    if (this.subject) {
      return this.subject;
    }
      
    // Convert 'pem' file to 'der'
    let subject = await openssl('x509', {
      noout: true,
      subject: true,
      in: this.pemFilename
    });
    let subRegex = /^subject[\w\W]*\/CN=([\w\W]*)(\n)?/;
    this.subject = subject.toString().match(subRegex)[1]; 
    return this.subject;
  }

}

/**
 * Interface for adding and removing records to TrustStore.sqlite3 databases that Keychains use
 */
class TrustStore {
  constructor (sharedResourceDir) {
    this.sqliteDBPath = path.resolve(sharedResourceDir, 'Library/Keychains/TrustStore.sqlite3');
    this.db = new sqlite3.Database(this.sqliteDBPath);
  }

  /**
   * Add record to tsettings
   */
  async addRecord (sha1, tset, subj, data) {
    let existingRecords = await this.getRecords(subj);
    if (existingRecords.length > 0) {
      return await this.db.runAsync(`UPDATE tsettings SET sha1=?, tset=?, data=? WHERE subj=?`, [sha1, tset, data, subj]);
    } else {
      return await this.db.runAsync(`INSERT INTO tsettings (sha1, subj, tset, data) VALUES (?, ?, ?, ?)`, [sha1, subj, tset, data]);
    }
  }

  /**
   * Remove record from tsettings
   */
  async removeRecord (subj) {
    return this.db.runAsync(`DELETE FROM tsettings WHERE subj = ?`, [subj]);
  }

  /**
   * Get a record from tsettings
   */
  async getRecords (subj) {
    return this.db.allAsync(`SELECT * FROM tsettings WHERE subj = ?`, [subj]);
  } 
}

export default Certificate;
export { Certificate, TrustStore }; 