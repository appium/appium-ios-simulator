import path from 'path';
import fs from 'fs/promises';

export async function copyDir (src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, {withFileTypes: true});
  await fs.mkdir(dest);
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

