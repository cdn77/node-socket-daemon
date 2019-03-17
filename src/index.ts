import * as program from 'commander';
import { loadConfig } from './config';
import { main } from './commands/main';
import { sendAction } from './commands/client';

const pkg = require('../package.json');
process.umask(0o117);

program
  .version(pkg.version, '-v, --version')
  .arguments('[action]')
  .option('-c, --config <path>', 'Config file path')
  .option('-s, --script <file>', 'Main script path')
  .option('-e, --listen-var <name>', 'Listen env var name')
  .option('-t, --tmp-dir <dir>', 'Temp directory path')
  .option('-o, --socket-file <file>', 'Socket file name')
  .option('-i, --ipc-file <file>', 'IPC file name')
  .option('-w, --workers <workers>', 'Workers', parseInt)
  .action(async action => {
    const options = await loadConfig(program);

    switch (action) {
      case 'start':
      case 'stop':
      case 'restart':
        await sendAction(options, action);
        break;

      case undefined:
        await main(options);
        break;

      default:
        console.error(`Unknown action: ${action}`);
        program.help();
        process.exit(1);
        break;
    }
  })
  .parse(process.argv);
