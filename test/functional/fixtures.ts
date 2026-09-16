import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {exec} from 'teen_process';

// A minimal valid 1x1 transparent PNG — real file bytes are all `addMedia` cares about, so there's
// no need to fetch a real photo asset for this.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Writes a throwaway 1x1 PNG to a fresh temp directory.
 *
 * @returns The path to the PNG file.
 */
export async function createTestPhoto(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'appium-ios-simulator-test-'));
  const filePath = path.join(dir, 'photo.png');
  await fs.writeFile(filePath, Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'));
  return filePath;
}

/**
 * Generates a throwaway self-signed certificate and returns its PEM content directly (not a file
 * path) — `Simulator.addCertificate()`'s own contract.
 *
 * @returns The PEM-encoded certificate content.
 */
export async function createSelfSignedCertContent(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'appium-ios-simulator-test-'));
  const certPath = path.join(dir, 'cert.pem');
  try {
    await exec('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      '/dev/null',
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=appium-ios-simulator-test',
    ]);
    return await fs.readFile(certPath, 'utf8');
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
}
