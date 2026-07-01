import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { SQLiteAdapter } from "../../plugins/ts/sqlite/src/index";
import { RadiantRuntime } from "../../runtime/bun/src/main/runtime";
import { compile } from "../../packages/cli/src/compiler";
import { RadiantLexer } from "../../packages/cli/src/parser/lexer";
import { parserInstance } from "../../packages/cli/src/parser/parser";
import { visitorInstance } from "../../packages/cli/src/parser/visitor";
import { resolveAuditSecret, verifyAuditChain } from "../../runtime/bun/src/security/audit";
import { randomUUID } from "crypto";

const dsl = `
config {
  security: {
    audit: { enabled: true }
  }
}

collection ecommerce_orders {
  fields: {
    amount: number
    status: text
  }
}
`;

describe('E2E Audit Trail Tests', () => {
  let app: RadiantRuntime;
  let schema: any;

  beforeAll(async () => {
    // 1. Build Schema
    const lexResult = RadiantLexer.tokenize(dsl);
    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.radiantFile();
    if (parserInstance.errors.length > 0) throw new Error("Parse Errors");
    const ast = visitorInstance.visit(cst);
    
    const compileResult = compile([ast]);
    schema = compileResult.schema;
    if (compileResult.errors.length > 0) throw new Error("Compile Errors");

    // 2. Setup SQLite Memory Adapter and start Runtime
    const adapter = new SQLiteAdapter(":memory:");
    process.env.RADIANT_AUDIT_SECRET = "super-secret-e2e-test-key";
    app = new RadiantRuntime(schema, { adapter });
    await app.start({ port: 0 }); // Random port
  });

  afterAll(async () => {
    // We could stop the app if app.stop() existed
  });

  test('Should perform database mutations and log to audit trail', async () => {
    // CREATE
    const id1 = randomUUID();
    const order1 = await app.create("ecommerce_orders", { 
      id: id1, amount: 150.50, status: "pending", 
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
    } as any);

    // Give background promise time to finish
    await new Promise(r => setTimeout(r, 100));

    // UPDATE
    const order2 = await app.update("ecommerce_orders", id1, { status: "shipped" });
    await new Promise(r => setTimeout(r, 100));

    // DELETE
    await app.delete("ecommerce_orders", id1);
    await new Promise(r => setTimeout(r, 100));

    // Validate Audit DB
    const logs = await app.adapter.find("radiant_audit_log", { sort: "createdAt" });
    expect(logs.docs.length).toBe(3);

    const [log1, log2, log3] = logs.docs as any[];

    expect(log1.action).toBe("create");
    expect(log1.recordId).toBe(id1);
    expect(log1.prevHmac).toBeNull();
    
    expect(log2.action).toBe("update");
    expect(log2.recordId).toBe(id1);
    expect(log2.prevHmac).toBe(log1.hmac);

    expect(log3.action).toBe("delete");
    expect(log3.recordId).toBe(id1);
    expect(log3.prevHmac).toBe(log2.hmac);

    // Cryptographic Chain Verification
    const key = await resolveAuditSecret(schema);
    const { ok, firstBadIndex } = await verifyAuditChain(key, logs.docs as any);
    
    expect(firstBadIndex).toBeNull();
    expect(ok).toBe(true);
  });
});
