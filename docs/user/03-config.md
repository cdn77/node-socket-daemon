# Configuring Nodesockd

Nodesockd is configured using one or more YAML config files. The available
configuration options are:

| Option       | Type                  | Description                                                                                                                                                          |
|--------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `extends`    | `string`              | An optional path to another configuration file to merge with the current file.                                                                                       |
| `script`     | `string`              | **Required.** The path to the worker script / entry point.                                                                                                           |
| `tmpDir`     | `string`              | **Required.** The path to the directory which should hold worker sockets, as well as the Nodesockd IPC socket.                                                       |
| `name`       | `string`              | The name to use in the process titles of all processes launched by Nodesockd; default: `app`.                                                                        |
| `socketFile` | `string`              | The name for the application socket file. This value must contain the `{worker}` placeholder, which will be replaced by the worker ID. Default: `app.{worker}.sock`. |
| `ipcFile`    | `string`              | The name of the IPC socket used to communicate between the daemon, the worker processes and the Nodesockd CLI. Defaults to `nodesockd.ipc`.                          |
| `workers`    | `int`                 | The number of workers Nodesockd should launch; defaults to `1`.                                                                                                      |
| `standby`    | `int`                 | The number of standby workers Nodesockd should launch; default is zero.                                                                                              |
| `options`    | `object`              | An object with some advanced options, see below.                                                                                                                     |
| `env`        | `string[]`            | An array of environment variable names to pass through to workers. `NODE_ENV` will be always included automatically.                                                 |
| `devServer`  | `boolean` or `number` | Configures the built-in development web server. `true` to enable the server on the default port `8000`, `number` to enable on a different port; `false` by default.  |
| `debug`      | `boolean`             | Set to `true` to enable more verbose output from the daemon if things get hairy.                                                                                     |

The `options` object can contain the following keys:

| Option             | Type     | Description                                                                                                                                                                                                                                                                                    |
|--------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `stdout`           | `string` | The path to a file into which the STDOUT of all workers should be redirected. By default STDOUT is discarded.                                                                                                                                                                                  |
| `stderr`           | `string` | The path to a file into which the STDERR of all workers should be redirected. If unspecified, defaults to `stdout`; if `stdout` is specified, but STDERR should be discarded, set this option to `null`.                                                                                       |
| `spawnTimeout`     | `int`    | The timeout for worker processes to spawn, in milliseconds. Spawning a worker process should be pretty fast, so this doesn't need to be too long. Default: `2000`.                                                                                                                             |
| `onlineTimeout`    | `int`    | The timeout for worker processes to report themselves as being online, in milliseconds. The countdown starts when the worker is spawned. This may need to be adjusted if your workers take a long time to initialise. Default: `10000`.                                                        |
| `shutdownTimeout`  | `int`    | The time after sending the worker a `shutdown` message after which more drastic measures should be taken if the worker fails to terminate. Default: `10000`.                                                                                                                                   |
| `maxStartAttempts` | `int`    | The maximum number of attempts to start a worker before an error is thrown. This is only applied when an explicit CLI command like `start` or `set-workers` is issued (including starting the daemon itself) - when a worker dies on its own, it will be restarted indefinitely. Default: `1`. |
| `symlinks`         | `string` | Specifies how the worker sockets should be referenced in the symlinks exposed to Nginx. Can be either `absolute` or `relative`. By default, the symlinks will be relative.                                                                                                                     |


## Config files vs. paths

When resolving config files to load, the following logic is employed:
 - If no config file is specified on the command line,
   a set of predefined config files are tried in the following order:
   - `./.nodesockd.local.yml`
   - `./.nodesockd.local.yaml`
   - `./nodesockd.local.yml`
   - `./nodesockd.local.yaml`
   - `./.nodesockd.yml`
   - `./.nodesockd.yaml`
   - `./nodesockd.yml`
   - `./nodesockd.yaml`
 - When resolving the initial config file, a relative path is resolved
   from the current working directory.
 - When resolving `extends`, any relative path which doesn't begin with `./` is
   first resolved using `require.resolve()`, meaning you can reuse config files
   exported by NPM packages - e.g. `extends: '@my-company/my-package/nodesockd.shared.yaml'`.
 - If a relative `extends` path begins with `./`, or resolution using
   `require.resolve()` fails, the path is resolved from the directory containing
   the config file where the `extends` option is specified.

All directives contained in any loaded config files are merged depth-first,
that is, you can override configuration specified in config files you extend.
When all config files are loaded, all paths specified in the resulting
configuration are resolved to absolute according to the following rules:
 - `script`, `tmpDir`, `options.stdout` and `options.stderr` are resolved
   relative to the first loaded config file's containing directory
 - `ipcFile` and `socketFile` are resolved relative to `tmpDir`


Next chapter: [Deployment][1]


[1]: user/04-deployment.md
