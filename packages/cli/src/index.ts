import { Command } from 'commander';

const r = "\x1b[38;2;34;211;238m"; // cyan-400
const w = "\x1b[38;2;255;255;255m"; // white
const b = "\x1b[1m"; // bold
const reset = "\x1b[0m";

console.log(`
${r}${b}  _____           _ _             _   ${reset}
${r}${b} |  __ \\         | (_)           | |  ${reset}
${r}${b} | |__) |__ _  __| |_  __ _ _ __ | |_ ${reset}
${r}${b} |  _  // _\` |/ _\` | |/ _\` | '_ \\| __|${reset}
${r}${b} | | \\ \\ (_| | (_| | | (_| | | | | |_ ${reset}
${r}${b} |_|  \\_\\__,_|\\__,_|_|\\__,_|_| |_|\\__|${reset}
`);

const program = new Command();

program
  .name('radiant')
  .description('CLI for Radiant DSL')
  .version('0.0.1');

program.command('generate')
  .description('Generate the radiant DSL into a schema.json and output runtime')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action(async (options) => {
    const { generateCommand } = await import('./generate');
    await generateCommand(options);
  });

program.command('init')
  .description('Initialize a new Radiant project in the current directory')
  .option('-d, --dir <path>', 'Path to initialize the radiant project')
  .action(async (options) => {
    const { initCommand } = await import('./init');
    await initCommand(options);
  });

program.command('dev')
  .description('Watch the radiant DSL and rebuild on changes')
  .option('-r, --runtime <type>', 'Runtime (e.g. ts, go)')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .action(async (options) => {
    const { devCommand } = await import('./dev');
    await devCommand(options);
  });

program.command('lsp')
  .description('Run the Radiant Language Server')
  .action(async () => {
    // We will dynamically import the LSP so it doesn't run during a normal build
    await import('./lsp/server');
  });

program.command('db:sync')
  .description('Sync the database schema against config.radiant. Use --force to apply destructive changes (drop orphaned tables/columns).')
  .option('-d, --dir <path>', 'Path to the radiant directory')
  .option('--force', 'Apply destructive changes (drop orphaned tables/columns)')
  .action(async (options) => {
    const { dbSyncCommand } = await import('./db-sync');
    await dbSyncCommand(options);
  });

program.parse(process.argv);
