const { NodesockdWorker } = require('..');
const { Server } = require('http');

(async () => {
  console.log('Starting up....');

  const worker = new NodesockdWorker();
  await worker.run();

  console.log(`Nodesockd worker running:`);
  console.log(` - pid: ${process.pid}`)
  console.log(worker.socketPath ? ` - socket path: ${worker.socketPath}` : ` - listen port: 8000`);

  const server = new Server();

  server.on('request', async (req, res) => {
    console.log('[%s] HTTP/%s %s %s', worker.id, req.httpVersion, req.method.toUpperCase(), req.url);
    await suspendResumed(worker);
    res.setHeader('Connection', 'close');
    res.end('Hello world!\n');
  });

  worker.on('shutdown', () => {
    console.log('Worker received shutdown command');
    server.close();
  });

  server.listen(worker.socketPath ?? 8000, async () => {
    await worker.reportOnline();
    console.log(`Server is listening for requests.`);
  });
})();

async function suspendResumed(worker) {
  const waiting = await Promise.race([
    worker.resumed,
    new Promise((r) => setTimeout(() => r(true), 50)),
  ]);

  if (waiting) {
    console.log('  waiting for resume...');
    await worker.resumed;
    console.log('  resumed');
  }
}
