import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { templates } from './templates';

export async function initCommand(options: any) {
  p.intro(pc.bgMagenta(pc.white(' Radiant Init ')));

  let projectName = options.dir;

  if (!projectName) {
    const namePrompt = await p.text({
      message: 'What is your project named?',
      placeholder: 'my-radiant-app',
      defaultValue: 'my-radiant-app'
    });

    if (p.isCancel(namePrompt)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    
    projectName = namePrompt as string;
  }

  const templateOptions = Object.entries(templates).map(([key, template]) => ({
    value: key,
    label: template.label,
    hint: template.hint
  }));

  const templateSelect = await p.select({
    message: 'Choose a template',
    options: templateOptions
  });

  if (p.isCancel(templateSelect)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  const selectedTemplateKey = templateSelect as string;
  const boilerplate = templates[selectedTemplateKey].content;

  const targetDir = join(process.cwd(), projectName);
  const radiantDir = join(targetDir, 'radiant');
  const configPath = join(radiantDir, 'config.radiant');

  if (existsSync(targetDir) && existsSync(configPath)) {
    p.cancel(`A radiant project is already initialized in ${pc.cyan(projectName)}`);
    process.exit(1);
  }

  const s = p.spinner();
  s.start(`Creating ${pc.cyan(projectName)}`);

  // Create the project and radiant directory
  if (!existsSync(radiantDir)) {
    mkdirSync(radiantDir, { recursive: true });
  }

  // Write the boilerplate
  writeFileSync(configPath, boilerplate, 'utf-8');

  s.stop(`Created ${pc.cyan(projectName)}`);

  p.note(
    `cd ${pc.cyan(projectName)}\n${pc.green('radiant dev')}`,
    'Next steps'
  );

  p.outro('🚀 Radiant initialized successfully!');
}
