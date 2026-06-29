import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export function initCommand(options: any) {
  const targetDir = options.dir || process.cwd();
  const radiantDir = join(targetDir, 'radiant');
  const configPath = join(radiantDir, 'config.radiant');

  if (existsSync(radiantDir) && existsSync(configPath)) {
    console.error('❌ A radiant project is already initialized in this directory.');
    process.exit(1);
  }

  // Create the radiant directory if it doesn't exist
  if (!existsSync(radiantDir)) {
    mkdirSync(radiantDir, { recursive: true });
    console.log('✅ Created radiant directory.');
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
    name: string;
    email: email @unique;
    password: password;
    role: string @default("user");
  }
}
`;

  writeFileSync(configPath, boilerplate, 'utf-8');
  console.log('✅ Created radiant/config.radiant');
  console.log('\n🚀 Radiant DSL initialized successfully! You can now start building your collections.');
}
