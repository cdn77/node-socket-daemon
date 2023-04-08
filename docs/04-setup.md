# Nodesockd setup

There are a couple of steps you need to take in order to enable your app
to use Nodesockd:

1. Application setup
   1. Install Nodesockd as a dependency of your app (`npm i --save nodesockd`)
   2. Set up [Nodesockd integration][1] within your application
   3. Create one or more [config files][2]
2. System setup
   1. Set up a temporary directory for your application socket files
   2. Configure Nginx to proxy requests to your application
   3. Set up a system service which will launch the Nodesockd daemon
   4. Configure your CI/CD pipeline to restart your application workers
      on deploy

This page details the second part of this list - the system setup.

## Temporary directory

As described in the [Core concepts][3] chapter, your application workers will
bind to unique UNIX sockets and the Nodesockd daemon will create symlinks to
those sockets for Nginx to consume. Special care must be taken to ensure all
parties have appropriate permissions to access these files in order for the
system to work properly.

There are multiple ways to achieve this. If you're a FACL magician, you can
probably go that route (although I could never get this to work properly);
otherwise the simplest method is to create a temporary directory owned by the
system user which the application runs under, and by the system group Nginx is
running under (usually `www-data` or `_www`); and then set the `SETGID` bit on
it. This will ensure that the application can create its sockets in the temp
directory, but thanks to the `SETGID` bit, they will inherit the group owner
of the temp directory, which is the Nginx group - therefore giving Nginx access
to them. These are the commands you can use to achieve the desired effect
(you'll probably need to be `root` to run them):

```shell
mkdir <temp-dir>
chown <app-user>:<nginx-group> <temp-dir>
chmod u=rwx,g=rsx,o= <temp-dir>  # notice the 's' in 'g=rsx'
```

## Configure Nginx

This is what you need to do in your Nginx config to allow it to proxy requests
to your application's workers:

```
upstream app-workers {
  # edit this to match the desired number of workers:
  server unix:<temp-dir>/app.0.sock;
  server unix:<temp-dir>/app.1.sock;
  server unix:<temp-dir>/app.2.sock;
}

server {
  listen 80;
  listen [::]:80;

  # ...

  location / {
    proxy_pass http://app-workers;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```


## Nodesockd service

The Nodesockd daemon will start and restart your application workers, but
you need some mechanism which will start and restart the daemon itself.
There are various ways to do this - you can use Systemd, Supervisord,
DaemonTools and many other things. It's really up to you - just make sure
that the Nodesockd daemon is running under the system user you want your
workers to run under, and not, for example, `root`.

The daemon is started using the `nodesockd daemon` command. It may be a good
idea to set the working directory of the service to the application root
directory. The `nodesockd` command will probably not be in your `$PATH`,
so assuming the service working directory is the application root, you can use
`node_modules/.bin/nodesockd`. If your config file is not in one of the
predefined locations as described in the [Config][2] chapter, you can tell the
daemon where to look for it using the `--config` option. An example script
to start the daemon using e.g. DaemonTools:

```shell
#!/usr/bin/env bash
cd /home/my-app
sudo -u app-user node_modules/.bin/nodesockd daemon
```

Example Systemd service unit:

```unit file (systemd)
[Unit]
Description=Nodesockd daemon
After=network.target

[Service]
Type=simple
User=app-user
WorkingDirectory=/home/my-app
ExecStart=node_modules/.bin/nodesockd
Restart=always

[Install]
WantedBy=multi-user.target
```

The daemon understands some common POSIX signals in the way they're typically
employed:
 - `SIGTERM` and `SIGINT` will cause the daemon to quit gracefully
 - `SIGHUP` will cause the daemon to reload the application config file


## Deployment

When deploying a new version of your application you need to restart the
application workers. This is done using the `nodesockd restart` command.

If you need to run something like database migrations while deploying your
application, you might want to use the _suspended mode_ to avoid downtime,
while ensuring your workers don't access the database until the migrations
have completed:

```shell
node_modules/.bin/nodesockd restart --suspended
./run-migrations
node_modules/.bin/nodesockd resume
```

If the migration fails for some reason, simply restore your application code
to its original state and run `nodesockd restart` to replace the (still
suspended) new workers with new instances of the previous application version's
workers.

Nodesockd itself may receive updates from time to time. If you decide to update
your app's version of Nodesockd, you'll need to restart the daemon in order
for the new version to be used. If you do this using the system service you've
set up to run Nodesockd, there will be downtime, because the daemon will shut
down all the workers when it is terminated - but there is another way: you can
use the `--upgrade` flag of the `nodesockd restart` command. This flag will
cause the daemon to check if its version is the currently installed one, and if
it's not, the daemon will detach from the current workers and then terminate
itself; then the system service manager should kick in and start a new daemon
process, which will _adopt_ the previous version's workers, and then the CLI
will re-issue the `restart` command to make the new daemon replace the adopted
workers with new ones. In other words, you can simply slap the `--upgrade` flag
onto the `nodesockd restart` command in your CI pipeline (yes, you can combine
it with `--suspend`) and you should be good.


Next chapter (probably only interesting for developers who want to get deep
into Nodesockd internals): [The IPC protocol][4]


[1]: ./02-integration.md
[2]: ./03-config.md
[3]: ./01-core-concepts.md
[4]: ./05-ipc.md
