# FAQ for sysadmins

### Basics

The Nodesockd daemon should be running as a system service, as described
in the [Setup][1] chapter. To communicate with the daemon, you can use the
Nodesockd CLI. The `nodesockd` command itself will typically not be in `$PATH` -
Nodesockd is supposed to be installed as an application dependency, so the
command will usually be available using `node_modules/.bin/nodesockd` in the
application root directory. The command will need to figure out where to find
the daemon's IPC file; it can either do this by loading the application's
Nodesockd config file (either from one of the predefined locations, or using
the `--config` command line option, see the [Config][2] chapter), or you can
tell it where to look explicitly using the `--ipc` option.

In the rest of this document, wherever the `nodesockd` command is used,
it means something like
`cd <app root>; node_modules/.bin/nodesockd [--config <file> | --ipc <path>]`.


### How do I restart the application workers?

```shell
nodesockd restart
```


### How do I change the number of active workers on the fly?

```shell
nodesockd set-workers <count>
```

Don't forget to update the site's Nginx config to list the same number of
upstreams as you have workers!


### How do I change the number of standby workers on the fly?

```shell
nodesockd set-standby <count>
```


### What to do when Nginx returns a gateway error?

This might mean a permission error when accessing the application socket files.
Check that the directory which should contain application sockets exists and
that the sockets are accessible by the Nginx process. See the [Setup][1] chapter
for details on the necessary permissions that should be set on the temporary
directory. If the sockets created by the application aren't group-writable,
it probably means that the application process disables the group-writable bit
using `umask` - talk to the application developers about this.


[1]: ./04-setup.md
[2]: ./03-config.md
