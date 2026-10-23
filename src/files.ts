import * as fs from 'node:fs';
import * as path from 'node:path';
export function saveCopy(destination: string, source: string | undefined, output: string): void {
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  const actual = (value: string) => {try {return fs.realpathSync(value);} catch {return path.join(fs.realpathSync(path.dirname(value)), path.basename(value));}};
  if (source && normalize(actual(source)) === normalize(actual(destination))) throw new Error('Choose a new file. The source file cannot be overwritten.');
  if (fs.existsSync(destination)) throw new Error('Choose a new filename. Existing files are not overwritten.');
  // Exclusive create also rejects symlinks, hardlinks, and files created after the check.
  fs.writeFileSync(destination, output, {encoding: 'utf8', flag: 'wx', mode: 0o600});
}
