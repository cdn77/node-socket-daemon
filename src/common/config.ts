import { dirname, resolve } from 'path';
import { readFile } from 'fs/promises';
import { load } from 'js-yaml';
import { z } from 'zod';

const partialOptionsSchema = z.strictObject({
  spawnTimeout: z.number().int().min(1).optional(),
  onlineTimeout: z.number().int().min(1).optional(),
  shutdownTimeout: z.number().int().min(1).optional(),
  maxStartAttempts: z.number().int().min(1).optional(),
  stdout: z.string().optional(),
  stderr: z.string().nullable().optional(),
});

const partialConfigSchema = z.strictObject({
  extends: z.string().optional(),
  name: z.string().optional(),
  script: z.string().optional(),
  tmpDir: z.string().optional(),
  socketFile: z.string().optional(),
  ipcFile: z.string().optional(),
  workers: z.number().int().min(1).optional(),
  standby: z.number().int().min(0).optional(),
  options: partialOptionsSchema.optional(),
  env: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
});

const finalOptionsSchema = z.strictObject({
  spawnTimeout: z.number().int().min(1).default(2000),
  onlineTimeout: z.number().int().min(1).default(10000),
  shutdownTimeout: z.number().int().min(1).default(10000),
  maxStartAttempts: z.number().int().min(1).default(1),
  stdout: z.string().optional(),
  stderr: z.string().nullable().optional(),
});

const finalConfigSchema = z.strictObject({
  name: z.string().default('app'),
  script: z.string(),
  tmpDir: z.string(),
  socketFile: z.string()
    .regex(/\{worker}/, `The 'socketFile' option must contain the '{worker}' placeholder`)
    .default('app.{worker}.sock'),
  ipcFile: z.string().default('nodesockd.ipc'),
  workers: z.number().int().min(1).default(1),
  standby: z.number().int().min(0).default(0),
  options: finalOptionsSchema.default({}),
  env: z.array(z.string()).default([]),
  debug: z.boolean().default(false),
});

type PartialConfig = z.infer<typeof partialConfigSchema>;
export type Config = z.infer<typeof finalConfigSchema>;
export type WorkerOptions = z.infer<typeof finalOptionsSchema>;


function resolveConfigPath(root: string, configFile: string): string {
  if (/^[.\/]/.test(configFile)) {
    return resolve(root, configFile);
  }

  try {
    return require.resolve(configFile);
  } catch {
    return resolve(root, configFile);
  }
}

const globalCandidates = [
  './.nodesockd.local.yml',
  './.nodesockd.local.yaml',
  './nodesockd.local.yml',
  './nodesockd.local.yaml',
  './.nodesockd.yml',
  './.nodesockd.yaml',
  './nodesockd.yml',
  './nodesockd.yaml',
];

async function loadConfigFile(root: string, candidates: string | string[]): Promise<[config: PartialConfig, path: string]> {
  Array.isArray(candidates) || (candidates = [candidates]);

  for (const candidate of candidates) {
    try {
      const configFile = resolveConfigPath(root, candidate);
      const contents = await readFile(configFile, 'utf-8');
      return [partialConfigSchema.parse(load(contents)), configFile];
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' && e.code === 'ENOENT') {
        continue;
      }

      throw e;
    }
  }

  throw new Error(
    candidates.length > 1
      ? 'No config file specified and no default config file exists'
      : `Config file '${candidates.join('')}' does not exist`,
  );
}

function resolvePaths(config: Config, files: string[]): [config: Config, files: string[]] {
  const root = dirname(files[0]);

  // paths relative to config file
  config.script = resolve(root, config.script);
  config.tmpDir = resolve(root, config.tmpDir);
  typeof config.options?.stdout === 'string' && (config.options.stdout = resolve(root, config.options.stdout));
  typeof config.options?.stderr === 'string' && (config.options.stderr = resolve(root, config.options.stderr));

  // paths relative to tmpDir
  config.ipcFile = resolve(config.tmpDir, config.ipcFile);
  config.socketFile = resolve(config.tmpDir, config.socketFile);

  return [config, files];
}

export async function loadConfig(cwd: string, configPath?: string): Promise<[config: Config, files: string[]]> {
  let candidates: string | string[] = configPath ?? globalCandidates;
  let config: PartialConfig = { options: {} };
  const files: string[] = [];

  do {
    const [{ extends: next, options = {}, ...cfg }, file] = await loadConfigFile(cwd, candidates);
    config = { ...cfg, ...config, options: { ...options, ...config.options } };
    files.push(file);
    candidates = next as any;
    cwd = dirname(file);
  } while (candidates);

  return resolvePaths(finalConfigSchema.parse(config), files);
}
