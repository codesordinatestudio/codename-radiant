import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { globSync } from 'glob'; // Wait, bun has a glob API or we can just use node fs, but let's just use a simple read for now. Wait, glob is better. I'll just use bun's glob or standard Node `fs.readdirSync`.
import { readdirSync, statSync } from 'fs';

import { RadiantLexer } from './parser/lexer';
import { parserInstance } from './parser/parser';
import { visitorInstance } from './parser/visitor';
import { compile } from './compiler';
import { generateTypeScript } from './generator/ts';

function findRadiantFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findRadiantFiles(filePath));
      } else if (filePath.endsWith('.radiant')) {
        results.push(filePath);
      }
    }
  } catch (err) {
    // ignore if dir doesn't exist
  }
  return results;
}

export function buildCommand(options: { runtime?: string, dir?: string, isDev?: boolean }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  const files = findRadiantFiles(dir);

  if (files.length === 0) {
    console.warn(`No .radiant files found in ${dir}`);
    return;
  }

  const rawAsts: any[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const lexResult = RadiantLexer.tokenize(text);

    if (lexResult.errors.length > 0) {
      console.error(`Lexing errors in ${file}:`);
      lexResult.errors.forEach(err => console.error(err.message));
      if (!options.isDev) process.exit(1);
      return;
    }

    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.radiantFile();

    if (parserInstance.errors.length > 0) {
      console.error(`Parsing errors in ${file}:`);
      parserInstance.errors.forEach(err => console.error(err.message));
      if (!options.isDev) process.exit(1);
      return;
    }

    const ast = visitorInstance.visit(cst);
    rawAsts.push(ast);
  }

  try {
    const { schema: finalSchema, errors } = compile(rawAsts);
    if (errors.length > 0) {
      console.error(`Semantic errors during compilation:`);
      errors.forEach(err => console.error(`- ${err.message}`));
      if (!options.isDev) process.exit(1);
      return;
    }
    const projectRoot = require('path').dirname(dir);
    const configOutput = finalSchema.output;
    
    let outDir = dir;
    if (configOutput) {
      outDir = resolve(dir, configOutput);
    }
    
    const outputPath = resolve(outDir, 'schema.json');
    
    // Strip internal compiler metadata out of the final JSON schema
    const cleanJson = JSON.stringify(finalSchema, (key, value) => {
      if (key === 'targetToken' || key === 'token' || key === 'uri' || key === 'nameToken' || key === 'typeToken') {
        return undefined;
      }
      return value;
    }, 2);
    
    writeFileSync(outputPath, cleanJson, 'utf-8');
    console.log(`Successfully built ${outputPath}`);

    if (options.runtime === 'ts' || !options.runtime) {
      const typesOutput = generateTypeScript(finalSchema);
      const typesPath = resolve(outDir, 'index.ts');
      writeFileSync(typesPath, typesOutput, 'utf-8');
      console.log(`Successfully generated ${typesPath}`);
    }
  } catch (err: any) {
    console.error(`Compilation error: ${err.message}`);
    if (!options.isDev) process.exit(1);
    return;
  }
}
