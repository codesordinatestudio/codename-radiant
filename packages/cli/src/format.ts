import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pc from 'picocolors';
import { findRadiantFiles } from './cli';
import { formatRadiant } from './lsp/formatter';

export async function formatCommand(options: { dir?: string }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  const files = findRadiantFiles(dir);

  if (files.length === 0) {
    console.warn(pc.yellow(`⚠️ No .radiant files found in ${dir}`));
    return;
  }

  let formattedCount = 0;

  for (const file of files) {
    try {
      const text = readFileSync(file, 'utf-8');
      const formattedText = formatRadiant(text);
      
      // Only write if changes were actually made to avoid touching mtime unnecessarily
      if (text !== formattedText) {
        writeFileSync(file, formattedText, 'utf-8');
        formattedCount++;
        console.log(`${pc.green('✔')} Formatted ${pc.cyan(file)}`);
      }
    } catch (err: any) {
      console.error(pc.red(`\n✖ Failed to format ${file}: ${err.message}`));
    }
  }

  if (formattedCount === 0) {
    console.log(`\n${pc.green('✔')} All ${files.length} .radiant files are already formatted!`);
  } else {
    console.log(`\n${pc.green('✔')} Formatted ${formattedCount} file(s) successfully.`);
  }
}
