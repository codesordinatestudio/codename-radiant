const fs = require('fs');
let code = fs.readFileSync('plugins/ts/sqlite/src/adapter.ts', 'utf8');

// Fix initDb and closeDb
code = code.replace(/private initDb\(\) \{[\s\S]*?\}\n\n  private async closeDb/, `private initDb() {
    this.db = new Database(this.url);
  }

  private async closeDb`);

code = code.replace(/private async closeDb\(dbInstance: any\) \{[\s\S]*?\}\n\n  \/\*\*/, `private async closeDb(dbInstance: any) {
    if (dbInstance) dbInstance.close();
  }

  /**`);

fs.writeFileSync('plugins/ts/sqlite/src/adapter.ts', code);
