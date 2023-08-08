# CLI commands

The `nodesockd` executable includes several useful subcommands. They can be
invoked using `node_modules/.bin/nodesockd <command>`. In the rest of this
document, the path to the `nodesockd` executable is left out for brevity.

- ### `nodesockd daemon`
  This command will start the Nodesockd daemon. Note that the daemon doesn't
  fork into the background - it stays in the foreground.

  **Options:**

  - `--config=<path>` _or_ `-c <path>`  
    The path to the Nodesockd config file. See the [Configuration][1] section
    for more about how the config file will be resolved.
  - `--dev-server[=port]` _or_ `-d [port]`  
    Pass this option to enable the built-in development web server. This allows
    you to use Nodesockd in development without the need to configure Nginx. If
    `port` is omitted, it defaults to `8000`.
  
  ---

- ### `nodesockd status`
  This command will display information about the daemon and all the currently
  running worker processes.
 
  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.
  
  ---

- ### `nodesockd config`
  This command will display the full resolved configuration of the running
  daemon, as well as a list of all the loaded config files.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd start`
  This command will instruct the running daemon to start all workers according
  to the currently loaded configuration. It has no effect if workers are already
  running.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.
  - `--suspended` _or_ `-s`  
    Start workers in [_suspended mode_][2].
  - `--max-attempts=<n>` _or_ `-m <n>`  
    Try at most `<n>` times to start each worker before giving up. Overrides the
    `options.maxStartAttempts` config option.

  ---
  
- ### `nodesockd restart`
  This command will instruct the running daemon to restart all running workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.
  - `--upgrade` _or_ `-u`  
    Attempt to upgrade the Nodesockd daemon prior to restarting workers. See the
    [Upgrading Nodesockd][2] section of the Deployment page to learn more.
  - `--suspended` _or_ `-s`  
    Start new workers in [_suspended mode_][3].
  - `--max-attempts=<n>` _or_ `-m <n>`  
    Try at most `<n>` times to start each new worker before giving up. Overrides
    the `options.maxStartAttempts` config option.

  ---

- ### `nodesockd resume`
  This command will instruct the running daemon to resume all [_suspended_][3]
  workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd stop`
  This command will instruct the running daemon to terminate all currently
  running workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd set-workers <n>`
  This command will change the number of active workers to `<n>`, starting or
  stopping workers as needed. It's a runtime override for the `workers` config
  option - until the config is reloaded or the daemon itself restarted, the
  daemon will endeavour to keep `<n>` workers online.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd set-standby <n>`
  This command will change the number of standby workers to `<n>`, starting or
  stopping workers as needed. It's a runtime override for the `standby` config
  option - until the config is reloaded or the daemon itself restarted, the
  daemon will endeavour to keep `<n>` workers on standby.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd reload`
  This command will instruct the daemon to reload its configuration. The daemon
  will re-read the initial config file from the path which was resolved when the
  daemon was started, and then `extends` options will be resolved as usual,
  meaning that the final list of loaded config files may change.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket. Note that if `--config` or `-c` is passed, it will only be used
    to resolve the path to the IPC socket; configuration will still be reloaded
    from the original config path as it was resolved when the daemon was
    started.

  ---

- ### `nodesockd terminate`
  This command will instruct the daemon to terminate itself, as well as all
  workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.

  ---

- ### `nodesockd send-msg <message> [data]`
  This command will send the specified `<message>`, optionally along with any
  JSON-serialized `[data]`, to one or more workers. See the [Messaging][4]
  section of the Integration page for details on how to specify which workers
  should receive the message and how to handle messages in workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.
  - `--workers=<workers>` _or_ `-w <workers>`  
    Limit which workers will receive the message. By default, all online workers
    will receive it.

  ---

- ### `nodesockd send-req <request> [data]`
  This command will send the specified `<request>`, optionally along with any
  JSON-serialized `[data]`, to one or more workers, and display the result from
  each worker. See the [Messaging][4] section of the Integration page for
  details on how to specify which workers should receive the request and how to
  handle requests in workers.

  **Options:**

  - ( `--config=<path>` _or_ `-c <path>` ) _or_ ( `--ipc=<path>` _or_ `-i <path>` )  
    The path to the Nodesockd config file, or the path to the running daemon's
    IPC socket.
  - `--workers=<workers>` _or_ `-w <workers>`  
    Limit which workers will receive the request. By default, all online workers
    will receive it.

  ---



[1]: user/03-config.md?id=config-files-vs-paths
[2]: user/04-deployment.md?id=upgrading-nodesockd
[3]: user/02-integration.md?id=suspended-workers
[4]: user/02-integration.md?id=messaging
