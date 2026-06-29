const fs = require('fs');
let code = fs.readFileSync('plugins/ts/sqlite/src/adapter.ts', 'utf8');

// Replace this.db.unsafe(...) with this.db!.query(...).all()
code = code.replace(/await this\.db\.unsafe\((.*?)\)/g, 'this.db!.query($1).all()');
code = code.replace(/this\.db\.unsafe\((.*?)\)/g, 'this.db!.query($1).all()');

// Replace this.db`...` with this.db!.query(`...`).all()
// This requires a bit of regex
code = code.replace(/await this\.db\s*\`([\s\S]*?)\`/g, 'this.db!.query(`$1`).all()');
code = code.replace(/this\.db\s*\`([\s\S]*?)\`/g, 'this.db!.query(`$1`).all()');

// Replace any remaining `sql` template tags, like sql`...` with just the string `...` since we build strings
code = code.replace(/sql\`([\s\S]*?)\`/g, '`$1`');

// There are type errors about `s` and `part` having any type in `serializeQuery`
code = code.replace(/serializeQuery\(s, /g, 'serializeQuery(s: any, ');
code = code.replace(/let sqlStr = typeof s === "string" \? s : s\.reduce\(\(acc, part, i\) => \{/g, 'let sqlStr = typeof s === "string" ? s : s.reduce((acc: any, part: any, i: number) => {');

fs.writeFileSync('plugins/ts/sqlite/src/adapter.ts', code);
