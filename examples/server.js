const { suspend, resume } = require('../');
const http = require('http');

const server = http.createServer((req, res) => {
  suspend(() => {
    res.write('Hello world!\n');
    res.end();
  });
});

const listenOn = process.env.LISTEN_ON
  ? /^\d+$/.test(process.env.LISTEN_ON)
    ? parseInt(process.env.LISTEN_ON)
    : process.env.LISTEN_ON
  : 4000;

server.listen(listenOn, () => {
  if (typeof listenOn === 'number') {
    console.log(`Server is listening on port ${listenOn}.`);
    console.log(
      `Open http://localhost:${listenOn}/ in your browser of choice to see that it works.`,
    );
  } else {
    console.log(`Server is listening on ${listenOn}.`);
    console.log(`Run curl --unix-socket ${listenOn} http://my.app/ to see that it works.`);
    console.log(
      'Note that the server is started in suspended mode, so all requests will be queued ' +
        'until you run "nodesockd resume".',
    );
  }

  if (process.send) {
    process.on('message', handleMessage);
    process.send('online');
  }
});

function handleMessage(message) {
  switch (message) {
    case 'shutdown':
      console.log('Terminating server.');
      server.close(err => {
        err && console.error(err);
        process.exit(err ? 1 : 0);
      });
      break;

    case 'resume':
      resume();
      break;

    default:
      console.warn('unknown action: "%s"', message);
      break;
  }
}
