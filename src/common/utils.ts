import { exec as execCb } from 'child_process';
import { realpath } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';

const exec = promisify(execCb);

export async function resolveCwd(): Promise<string> {
  const candidates = [() => process.env.PWD, async () => (await exec('pwd')).toString().trim()];
  const cwd = process.cwd();

  for (const candidate of candidates) {
    try {
      const wd = await candidate();

      if (wd && await realpath(wd) === cwd) {
        return wd;
      }
    } catch (e) {
      // noop
    }
  }

  return cwd;
}

export function getNodesockdVersion(): string {
  const pkg = require(resolve(__dirname, '../../package.json'));
  return pkg.version;
}
