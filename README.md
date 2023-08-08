# Nodesockd

This tool is the missing link between a Nginx reverse proxy and a Node.js backend service.
Typically, setups like this bind the backend service to a port on the loopback interface,
which is secure enough, but adds some overhead. There are some pitfalls to switching over
to UNIX sockets though, and this package aims to address them in one fell swoop:

 - atomic deploy, even with database migrations
 - multiple workers supported
 - standby workers for fast failover


## Installation

```bash
npm install --save nodesockd
```


## [Documentation][1]


## Quick start

Create a file called `nodesockd.yaml` in your application's root directory
with the following contents:

```yaml
# nodesockd.yaml
script: build/app.js  # the entrypoint of your app
tmpDir: tmp           # make sure this directory exists!
```

Next, in your app entrypoint, you'll need to do something like this:

```typescript
// src/app.ts

import { nodesockd } from 'nodesockd';
import * as express from 'express';

const app = express();

// register routes etc.

const server = app.listen(nodesockd.socketPath ?? 1234, async () => {
  // tell Nodesockd that the worker is ready to start serving requests:
  await nodesockd.reportOnline();
});

nodesockd.on('shutdown', () => {
  // when Nodesockd tells the worker to shut down:
  server.close();
});
```

Now you can run your app like this:

```shell
# through Nodesockd - will listen on port 8000:
node_modules/.bin/nodesockd daemon --dev-server

# change the dev server listen port:
node_modules/.bin/nodesockd daemon --dev-server=8123

# without Nodesockd - will listen on the fallback port 1234
# defined in the app code:
node build/app.js
```

Of course, this is what you might use for local development; in production,
you'll need to set some things up to correctly expose the application sockets
to Nginx. Refer to the [documentation][1] for more details.

[1]: https://cdn77.github.io/node-socket-daemon
