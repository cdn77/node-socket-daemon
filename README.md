# Node.js Socket Daemon 

This tool is the missing link between a Nginx reverse proxy and a Node.js backend service.
Typically setups like this bind the backend service to a port on the loopback interface,
which is secure enough, but adds some overhead. There are some pitfalls to switching over
to UNIX sockets though, and this package aims to address them in one fell swoop:

 - atomic deploy
 - multiple workers supported
 - workers are automatically restarted on failure

You can do all of these and more using tools like `pm2` and `naught`, but none of those
support UNIX sockets. If that's as big of a deal for you as it was for me, this tool
has your back!

## Installation

You can install the tool globally using this command:

```bash
npm install --global nodesockd
```

Note that you'll probably need to run this as root or using `sudo` unless your NPM setup
allows unprivileged users to install global packages. Alternatively you can install the
tool locally as a direct dependency of your project using:

```bash
npm install --save nodesockd
```

## Usage

### Prerequisites

First of all, this tool assumes that you're running Nginx as the `www-data`, `_www`
or similar system user and that you have a separate system user for your application,
let's call it e.g. `myapp`. You'll need to create a temp directory for the sockets
that Nginx uses to communicate with your app. This directory and the permissions you'll
set on it are vital to how this tool was designed to work, so take care to understand
what's going on properly. For the sake of the example we'll assume the directory is
`/var/run/myapp`.

To set the proper ownership and permissions on your temp directory, run the following
commands (replacing `myapp`, `www-data` and `/var/run/myapp` as appropriate):

```bash
chown myapp:www-data /var/run/myapp
chmod u=rwx,g=rsx,o= /var/run/myapp
```

The first command makes the temp directory owned by the `myapp` user and the `www-data` group.
The second command allows `myapp` to read and write the directory, allows the `www-data` group
to read it and forbids anyone else from accessing it at all; but perhaps the most important thing
it does is set the [`SETGID` bit][1] (that's the `s` in `g=rsx`). When a directory has this bit set,
any new file anyone creates within the directory will automatically be owned by the same group
as the directory itself. Note that you'll have to run both of these commands as root or using `sudo`.

### Integration within your app

There are three distinct things your app needs to do in order to work with `nodesockd`:

 1. Accept an environment variable defining the path to the socket it should listen on.
 2. When the app is online and ready to handle requests, it should notify `nodesockd`
    of this fact using `process.send('online')`.
 3. When the app receives the `shutdown` message, it should gracefully quit.

An example of how this would be done in an Express app:

```javascript
const server = app.listen(process.env.LISTEN_ON, () => {
  if (process.send) {
    process.send('online');
    
    process.on('message', message => {
      if (message === 'shutdown') {
        server.close(() => process.exit(0));
      }
    });
  }
});
```

Note that this example allows you to run the app locally as usual - if the app wasn't
run using `nodesockd`, the `process.send` method won't exist, so all of the
internal integration will silently do nothing. The only thing you'd have to provide
yourself is the `LISTEN_ON` environment variable; this can be done inline when running
the app (e.g. `LISTEN_ON=8000 npm start` to run the app on `http://localhost:8000`),
or using `dotenv` or something similar.

Once your app is ready for prime time, you can run it using the `nodesockd` command.
The command has the following options:

 - `-s` or `--script`: path to the main script file of your app
 - `-e` or `--listen-var`: name of the environment variable defining the socket path
   (defaults to `LISTEN_ON`)
 - `-t` or `--tmp-dir`: path to the temp directory created previously
 - `-o` or `--socket-file`: socket file name pattern (more on that shorty)
 - `-i` or `--ipc-file`: name of an [IPC file][2] the tool uses internally
   (defaults to `nodesockd.ipc`)
 - `-w` or `--workers`: number of workers to launch and oversee (defaults to 1)
 - `-c` or `--config`: path to a config file where you can define all of the above

You can put the options in a JSON config file; the config keys are `camelCase` versions
of the `--long-options`. You can also combine a config file with command-line options,
this can be useful in some edge cases which we'll describe later. If you provide
the `-c` or `--config` option, all other paths (both those specified in the config file
_and_ those you pass in other command line arguments) will be resolved relative to the
config file (unless they are already absolute); otherwise all such paths will be resolved
relative to the current working directory. Options passed on the command line take
precedence over options defined in the config file.

The `socketFile` option is used to specify a pattern for socket file names as seen from
Nginx. If you only intend to run a single worker you can just specify a file name; if
you wish to run multiple workers you need to specify a pattern including the `{worker}`
placeholder somewhere. E.g. if you run a single worker, `socketFile` can be `myapp.sock`,
and if you run multiple, it can be `myapp.{worker}.sock`. The tool will assign each
worker its own socket in the `tmpDir` directory, so using the example values from earlier,
if you specify `myapp.sock` and `1` as `socketFile` and `workers`, respectively,
the full path to the socket will be `/var/run/myapp/myapp.sock`. If you instead specify
`myapp.{worker}.sock` and `3`, the workers will be assigned the following sockets:
```
/var/run/myapp/myapp.0.sock
/var/run/myapp/myapp.1.sock
/var/run/myapp/myapp.2.sock
```

### Integration with Nginx

Example configuration for a single worker:

```
server {
  listen 80;
  listen [::]:80;
  
  server_name myapp.com;
  
  location / {
    proxy_pass http://unix:/var/run/myapp/myapp.sock:/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Example configuration for multiple workers:

```
upstream myapp {
  server unix:/var/run/myapp/myapp.0.sock;
  server unix:/var/run/myapp/myapp.1.sock;
  server unix:/var/run/myapp/myapp.2.sock;
}

server {
  listen 80;
  listen [::]:80;
  
  server_name myapp.com;
  
  location / {
    proxy_pass http://myapp;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

You can leverage the extensive load-balancing features of Nginx
to configure which worker will handle which request.

### Deployment

Once you've prepared the temporary directory, implemented the required integration
features within your app, prepared a config file for `nodesockd` and updated
your Nginx configuration, you can start the app using the following command:

```bash
nodesockd --config /path/to/your/app/nodesockd.json
```

Use `/path/to/your/app/node_modules/.bin/nodesockd` instead of `nodesockd`
if you installed `nodesockd` as a local dependency in your project
instead of globally.

The workers can be started, stopped and restarted using `nodesockd start`,
`nodesockd stop` and `nodesockd restart`, respectively. In order for these
commands to be able to talk to the running instance of `nodesockd`, you'll
either need to specify the `--config` option, or the `--ipc-file` option
providing the full path to the IPC file the running instance uses. Unless
you provided an absolute path for `ipcFile` when running the daemon, the IPC
file will be created in the `tmpDir` directory.

### Atomic deployment with database migrations

Chances are that your app uses some kind of a database backend and also that
your database backend sometimes needs to be updated as part of the deployment
pipeline of your app. You may be using something like [TypeORM][3] and its
migrations, which means that your deployment pipeline would include building
the new version of your app, applying database migrations and restarting
your app's workers. Well, the issue is that between applying migrations
and restarting workers there will still be a short window when your old workers
are up, but the database has already been changed, and the old workers mightn't
enjoy that very much. If you were to swap the order of actions so that new workers
are started before the migrations are applied then the new workers could suffer
from the same issue.

Node Socket Daemon offers a solution for this issue: start your new workers
in a suspended mode where all incoming requests are put on hold, apply migrations
and tell workers to resume normal operation. All requests that arrived when
workers were in suspended mode will be processed as usual, they'll only be
slightly delayed (that is if your migrations only take a second or two to run).

In an Express context you could implement that like this:

```javascript
const { suspend } = require('nodesockd');

// apply this as the first middleware in the pipeline
// so that it is used for all requests:
app.use(suspend.express);
```

The `suspend()` function exported from `nodesockd` returns a Promise which you
can await in your app to delay things until after migrations have been applied;
the `suspend.express` middleware is a wrapper which makes this work with Express.
The internal promise is resolved when the `resume` message is received (via
`process.on('message')`). 

Then in your deployment pipeline you need to:
 - restart workers using `nodesockd restart --suspended`
 - apply database migrations
 - resume workers using `nodesockd resume`
 
Of course if your app is a single-page app it's still possible that some
of your users will have an older version of the front-end code loaded
in their browser, which may lead to conflicts with a newer backend API,
but that's something you'll need to solve on your own.

[1]: https://en.wikipedia.org/wiki/Setuid#When_set_on_a_directory
[2]: https://en.wikipedia.org/wiki/Inter-process_communication
[3]: https://github.com/typeorm/typeorm
