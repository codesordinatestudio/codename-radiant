import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export async function initCommand(options: any) {
  let projectName = options.dir;

  if (!projectName) {
    const rl = readline.createInterface({ input, output });
    projectName = await rl.question('What is your project named? (default: my-radiant-app): ');
    rl.close();
  }

  if (!projectName || projectName.trim() === '') {
    projectName = 'my-radiant-app';
  }

  const targetDir = join(process.cwd(), projectName);
  const radiantDir = join(targetDir, 'radiant');
  const configPath = join(radiantDir, 'config.radiant');

  if (existsSync(targetDir) && existsSync(configPath)) {
    console.error('❌ A radiant project is already initialized in this directory.');
    process.exit(1);
  }

  // Create the project and radiant directory
  if (!existsSync(radiantDir)) {
    mkdirSync(radiantDir, { recursive: true });
    console.log(`✅ Created project folder: ${projectName}`);
    console.log(`✅ Created radiant directory.`);
  }

  // Write the boilerplate
  const boilerplate = `config {
  core: {
    api: {
      prefix: "/api"
    }
  };

  security: {
    auth: {
      strategies: ["jwt"],
      jwt: {
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      }
    }
  };

  monitoring: {
    healthCheck: {
      enabled: true,
      path: "/health"
    }
  };
}

collection users {
  auth: true;
  fields: {
    name: text;
    email: email @unique;
    password: password;
    role: text @default("user");
  }
}
`;

  writeFileSync(configPath, boilerplate, 'utf-8');
  console.log('✅ Created radiant/config.radiant');
  console.log('\n🚀 Radiant DSL initialized successfully! You can now start building your collections.');
}
