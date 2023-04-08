# Configuring Nodesockd

Nodesockd is configured using one or more YAML config files. The available
configuration options are:

 - `extends`: an optional path to another configuration file to merge with the
   current file
 - `script` **(required)**: the path to the worker script
 - `tmpDir` **(required)**: the path to the directory which should hold worker
   sockets, as well as the Nodesockd IPC socket
 - `name`: the name to use in the process titles of all processes launched
   by Nodesockd; default: `app`
 - `socketFile`: the name for the application socket file; this value must
   contain the `{worker}` placeholder, which will be replaced by the worker ID;
   default: `app.{worker}.sock`
 - `ipcFile`: the name of the IPC socket used to communicate between the daemon,
   the worker processes and the Nodesockd CLI; defaults to `nodesockd.ipc`
 - `workers`: the number of workers Nodesockd should launch; defaults to `1`
 - `standby`: the number of standby workers Nodesockd should launch; default is
   zero
 - `options`: an object with some advanced options:
   - `stdout`: the path to a file into which the STDOUT of all workers should
     be redirected; by default STDOUT is discarded
   - `stderr`: the path to a file into which the STDERR of all workers should
     be redirected; if unspecified, defaults to `stdout`; if `stdout` is
     specified, but STDERR should be discarded, set this option to `null`
   - `spawnTimeout`: the timeout for worker processes to spawn, in milliseconds;
     spawning a worker process should be pretty fast, so this doesn't need to be
     too long; default: `2000`
   - `onlineTimeout`: the timeout for worker processes to report themselves as
     being online, in milliseconds; the countdown starts when the worker is
     spawned; this may need to be adjusted if your workers take a long time
     to initialise; default: `10000`
   - `shutdownTimeout`: the time after sending the worker a `shutdown` message
     after which more drastic measures should be taken if the worker fails
     to terminate; default: `10000`
 - `env`: an array of environment variable names to pass through to workers;
   `NODE_ENV` will be always included automatically
 - `debug`: set to `true` to enable more verbose output from the daemon if
   things get hairy


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
 - If a relative `extends` path doesn't begin with `./`, or resolution using
   `require.resolve()` fails, it is resolved from the directory containing the
   config file where the `extends` option is specified.

All directives contained in any loaded config files are merged depth-first,
that is, you can override configuration specified in config files you extend.
When all config files are loaded, all paths specified in the resulting
configuration are resolved to absolute according to the following rules:
 - `script`, `tmpDir`, `options.stdout` and `options.stderr` are resolved
   relative to the first loaded config file's containing directory
 - `ipcFile` and `socketFile` are resolved relative to `tmpDir`


Next chapter: [System setup][1]


[1]: ./04-setup.md
