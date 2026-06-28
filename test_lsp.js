const { spawn } = require('child_process');

const server = spawn('bun', ['run', '/Users/chijiokeudokporo/CodesOrdinate/radiant/packages/cli/src/lsp/server.ts', '--stdio'], {
  cwd: '/Users/chijiokeudokporo/CodesOrdinate/radiant'
});

server.stdout.on('data', (data) => {
  console.log(`STDOUT: ${data}`);
});

server.stderr.on('data', (data) => {
  console.log(`STDERR: ${data}`);
});

server.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});

const initMessage = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: process.pid,
    rootUri: "file:///Users/chijiokeudokporo/CodesOrdinate/radiant",
    capabilities: {}
  }
};

const body = JSON.stringify(initMessage);
const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

server.stdin.write(header + body);
