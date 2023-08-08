# Integrating Nodesockd with application workers

As described in the previous chapter, workers need to implement
a couple of things in order to properly integrate with Nodesockd.
At a minimum, workers must accept the socket path from the daemon
and report back when they are ready to serve requests:

```typescript
import { nodesockd } from 'nodesockd';
import { Server } from 'http';

const server = new Server();

// this allows you to run the worker standalone on port 8000:
server.listen(nodesockd.socketPath ?? 8000, async () => {
 await nodesockd.reportOnline();
});
```

Workers should also listen for the `shutdown` event on the `nodesockd`
object and exit gracefully when it is received:

```typescript
nodesockd.on('shutdown', () => {
  server.close();
});
```

If a worker fails to exit gracefully within a configured time after receiving
the `shutdown` event, it will be sent a `TERM` signal, followed another couple
of seconds later by a `KILL` signal.

If you want to get up and running with the basic integration, you can now
skip ahead to the [configuration chapter][1], as the rest of this chapter
deals with advanced integration which you can always come back to later.


## Suspended workers

If you want to use the suspend feature to allow atomic deploys with migrations,
or if you want to use standby workers, your integration should honor the exposed
Promise in order to suspend any activity until a resume command is issued:

```typescript
// when handling HTTP requests:
server.on('request', async (req, res) => {
 await nodesockd.resumed;
 // continue with normal request handling
});

// in Express.js, there's a middleware for this:
app.use(nodesockd.suspendMiddleware);

// remember to also suspend any background tasks, e.g.:
nodesockd.resumed.then(() => {
  // it's better to wait before starting the timer for the task,
  // as opposed to adding `await nodesockd.resumed` at the start
  // of the task callback, to prevent multiple tasks accumulating
  // and then launching simultaneously when the app is resumed
  setInterval(periodicBackgroundTask, 5000);
});

// if you just want to check whether the app is currently
// suspended so that you could e.g. log a message,
// you can use this:
if (nodesockd.suspended) {
  console.log('Worker starting in suspended mode');
}
```


## Marking a worker as broken

When a worker encounters an error, it can take one of the following actions:
 1. Ignore the error - might be perfectly reasonable in some situations, e.g.
    a 404
 2. Terminate immediately, using something like `process.exit()`, when
    the error is catastrophic and unrecoverable
 3. Middle ground: when the error is severe enough that the worker should be
    replaced, but isolated enough that the worker should still be able to handle
    _most_ requests at least for a couple of seconds, the worker can report
    itself as broken to the daemon, which will replace the worker as soon as
    a replacement can be brought online:

    ```typescript
    await nodesockd.reportBroken(err.message);
    ```


## Messaging

Since Nodesockd already includes a mechanism for talking to all the workers,
it makes sense to expose this mechanism to the application as well. Using this
mechanism, workers can talk to each other, and you can talk to them using CLI
commands or a custom IPC client.

The nitty-gritty details of the IPC protocol are explained in
[a separate document][2], but the gist is this: the IPC plumbing
supports one-way _messages_ and two-way _requests_. The protocol defines
message and request types which each side can handle, and there is a dedicated
message and request type for app-specific communication, meaning you don't have
to worry about conflicts with internal Nodesockd messages. App-specific messages
and requests can be addressed to all currently active workers, or only some of
them.

The Nodesockd CLI has commands you can use to send messages and requests
to workers:

```shell
nodesockd send-msg <message> [data] [--workers <workers>]
nodesockd send-req <request> [data] [--workers <workers>]
```

There is also an IPC client library you can use to build your own CLI commands
which leverage app requests and messages:

```typescript
import { NodesockdClient } from 'nodesockd/client';

// create a client instance:
const client = new NodesockdClient('path/to/nodesockd.ipc');

// connect to the daemon; this will reject with an IpcConnectionError
// if a connection to the daemon cannot be established:
await client.run();

// send messages:
await client.sendAppMessage('<message>', { data: true }, '<workers>');

// send requests and consume replies:
for await (const reply of client.sendAppRequest('<request>', { data: true }, '<workers>')) {
  console.log(reply.id, reply.pid, reply.data);
}

// cleanup:
await client.terminate();
```

And this is how you would integrate messaging in your workers:

```typescript
import { nodesockd } from 'nodesockd';

// handle messages:
nodesockd.on('message', (message, data) => {
  console.log(message, data);
});

// handle requests:
nodesockd.setRequestHandler('<request>', async (data) => {
  return 'reply';
});

// you can even reply with a stream instead of a single reply:
nodesockd.setRequestHandler('<request>', async function * (data) {
  yield 'reply 1';
  yield 'reply 2';
  yield 'reply 3';
});
```

The `message` and `request` arguments are strings, and they are always
required; the `data` argument is optional and if specified, it must be
a JSON-serializable object (when passed on the command line, it must already
be specified as JSON). Replies to requests must also be JSON-serializable,
but don't need to be objects.

The `workers` option is an optional string specifying which workers should
be the recipients of the communication; if not specified, all currently active
online workers will be selected. The string must be a comma-separated list
of _specifiers_:

 - An integer will be used to select a worker by its index.
 - An integer range, e.g. `2-4`, will likewise select workers by their index;
   omitting the range start will select from `0`, and omitting the range end
   will select all workers up to the highest index.
 - An integer prefixed with a `$` will select a worker by its PID.
 - A hexadecimal UUID will select a worker by its ID.
 - The special string `self` can be used when a worker is sending a message
   or a request to denote itself.

Prefixing a specifier with a `!` will invert the selection (and suddenly the
`self` specifier makes much more sense). Note that the only way to select
workers which aren't currently active (e.g. standbys) is by specifying their
ID or PID.

Next chapter: [Configuring Nodesockd][1]


[1]: user/03-config.md
[2]: dev/01-ipc.md
