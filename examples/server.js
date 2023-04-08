const { nodesockd } = require('..');
const { Server } = require('http');

console.log('Starting up....');

console.log(`Nodesockd worker running:`);
console.log(` - pid: ${process.pid}`)
console.log(nodesockd.socketPath ? ` - socket path: ${nodesockd.socketPath}` : ` - listen port: 8000`);

const server = new Server();

server.on('request', async (req, res) => {
  console.log('[%s] HTTP/%s %s %s', nodesockd.id, req.httpVersion, req.method.toUpperCase(), req.url);
  await suspendResumed(nodesockd);
  res.setHeader('Connection', 'close');
  res.end('Hello world!\n');
});

nodesockd.on('shutdown', () => {
  console.log('Worker received shutdown command');
  server.close();
});

server.listen(nodesockd.socketPath ?? 8000, async () => {
  await nodesockd.reportOnline();
  console.log(`Server is listening for requests.`);
});

async function suspendResumed() {
  // usually you would just `await nodesockd.resumed` in place of calling
  // this function; it is just a helper to log the fact that we were indeed
  // waiting for the worker to be resumed
  if (nodesockd.suspended) {
    console.log('  waiting for resume...');
    await nodesockd.resumed;
    console.log('  resumed');
  }
}
