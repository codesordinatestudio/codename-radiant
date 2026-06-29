import { $ } from 'bun';
import { readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const workspaces = ['packages', 'runtime', 'plugins'];
const linkedPackages: string[] = [];

console.log('🔗 Linking Radiant Monorepo Packages...');

for (const workspace of workspaces) {
  const workspacePath = join(import.meta.dir, '..', workspace);
  if (!existsSync(workspacePath)) continue;

  const dirs = readdirSync(workspacePath);
  for (const dir of dirs) {
    const fullPath = join(workspacePath, dir);
    if (statSync(fullPath).isDirectory()) {
      const pkgJsonPath = join(fullPath, 'package.json');
      if (existsSync(pkgJsonPath)) {
        try {
          const pkgJson = require(pkgJsonPath);
          if (pkgJson.name) {
            console.log(`Linking ${pkgJson.name}...`);
            await $`cd ${fullPath} && bun link`;
            linkedPackages.push(pkgJson.name);
          }
        } catch (e) {
          console.error(`Error reading ${pkgJsonPath}:`, e);
        }
      }
    }
  }
}

console.log('\n✅ All packages successfully linked!');

const mdContent = `# Linked Packages

You can use these packages in any standalone project by running the following commands in your standalone project's terminal:

\`\`\`bash
${linkedPackages.map(name => `bun link ${name}`).join('\n')}
\`\`\`

> **Note:** To install them as normal dependencies later, replace \`bun link\` with \`bun add\`.
`;

const mdPath = join(import.meta.dir, '..', 'linked.md');
writeFileSync(mdPath, mdContent, 'utf-8');

console.log(`📄 Generated ${mdPath} with instructions on how to use them.`);
