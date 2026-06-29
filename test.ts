import { spawnSync } from 'bun';
const result = spawnSync(['bun', 'run', 'packages/cli/src/index.ts', 'build', '-d', '_tests/e2e/temp_dev_dir/radiant']);
console.log(result.stdout.toString(), result.stderr.toString());
