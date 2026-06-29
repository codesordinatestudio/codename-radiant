import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'bun';

const TEST_DIR = join(__dirname, 'temp_dev_dir');
const RADIANT_DIR = join(TEST_DIR, 'radiant');
const CLI_PATH = join(__dirname, '../../packages/cli/src/index.ts');

describe('Dev Watcher E2E', () => {
  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(RADIANT_DIR, { recursive: true });
    await writeFile(join(TEST_DIR, 'package.json'), '{}');
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('watches for file changes and rebuilds', async () => {
    const initialConfig = `
      config {
        apiPrefix: "/api"
      }
    `;
    const targetFile = join(RADIANT_DIR, 'config.radiant');
    await writeFile(targetFile, initialConfig);

    const proc = spawn(['bun', 'run', CLI_PATH, 'dev', '--runtime=ts', '-d', RADIANT_DIR], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    // Helper to read stdout chunks until a specific string appears
    const waitForOutput = async (str: string, maxRetries = 20): Promise<boolean> => {
      let retries = 0;
      let outputBuffer = '';
      
      const reader = proc.stdout.getReader();
      try {
        while (retries < maxRetries) {
          // Add a tiny delay to allow output to buffer
          await new Promise(r => setTimeout(r, 100));
          
          // Poll reader (we don't wait forever, just quickly check)
          // Actually Bun reader might block if no data, let's just do a timeout-based read or rely on promises.
          // Since we might block forever, let's set a timeout.
          // For simplicity, we just use the async iterator approach and break if found.
          return await new Promise<boolean>((resolve) => {
             let found = false;
             const timeout = setTimeout(() => {
                if (!found) resolve(false);
             }, maxRetries * 100);

             (async () => {
                try {
                  const chunk = await reader.read();
                  if (chunk.value) {
                    const text = new TextDecoder().decode(chunk.value);
                    outputBuffer += text;
                    if (outputBuffer.includes(str)) {
                       found = true;
                       clearTimeout(timeout);
                       resolve(true);
                    }
                  }
                } catch (e) {
                   // ignore
                }
             })();
          });
        }
      } finally {
        reader.releaseLock();
      }
      return false;
    };

    // Note: The dev watcher in bun might behave synchronously or buffer. 
    // We'll write the file after a short delay and just listen for "Rebuilding...".
    await new Promise(r => setTimeout(r, 500));
    
    // Trigger a change
    await writeFile(targetFile, `config { apiPrefix: "/v2" }`);
    
    // We expect "Rebuilding..." in the stdout.
    // Instead of complex stream readers which might hang, let's just wait 1 second, kill it, and read the buffered output.
    await new Promise(r => setTimeout(r, 1500));
    proc.kill();
    
    const output = await new Response(proc.stdout).text();
    
    expect(output).toContain('Starting dev watcher');
    expect(output).toContain('has been changed. Rebuilding...');
  });

  test('debounces rapid rapid file change events to avoid build race conditions', async () => {
    const targetFile = join(RADIANT_DIR, 'config.radiant');
    await writeFile(targetFile, `config { apiPrefix: "/api" }`);

    const proc = spawn(['bun', 'run', CLI_PATH, 'dev', '--runtime=ts', '-d', RADIANT_DIR], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    await new Promise(r => setTimeout(r, 500));
    
    // Trigger 5 changes in rapid succession (simulating an editor's "Save All" or an automated formatter)
    for (let i = 0; i < 5; i++) {
       await writeFile(targetFile, `config { apiPrefix: "/v${i}" }`);
    }
    
    await new Promise(r => setTimeout(r, 1500));
    proc.kill();
    
    const output = await new Response(proc.stdout).text();
    
    // We expect "Starting dev watcher" once
    const rebuildInstances = output.split('Rebuilding...').length - 1;
    // With a 100ms debounce, 5 rapid synchronous writes should only trigger Rebuilding ONCE (or maybe twice if it was slightly spaced out, but certainly not 5 times).
    expect(rebuildInstances).toBeLessThan(5);
  });
});
