import { $, file } from "bun";
import { existsSync, rmSync } from "fs";

console.log("\n🚀 Starting Local CI/CD Pipeline (E2E)\n");

console.log("📦 Spinning up isolated services (Postgres, Redis, Mongo, SurrealDB, Mailpit)...");
const upResult = await $`docker compose -f docker-compose.e2e.yml up -d --wait`.nothrow();

if (upResult.exitCode !== 0) {
  console.error("❌ Failed to start Docker Compose services:");
  console.error(upResult.stderr.toString());
  process.exit(1);
}

console.log("✅ Services are up and healthy!");
console.log("🧪 Running End-to-End Tests...");

// Clean up old report
const reportXmlPath = "_tests/e2e/report.xml";
const reportMdPath = "_tests/e2e/report.md";
if (existsSync(reportXmlPath)) rmSync(reportXmlPath);

const testResult = await $`bun test _tests/e2e --reporter=junit --reporter-outfile=${reportXmlPath}`.nothrow();

console.log("\n🧹 Tearing down isolated services...");
await $`docker compose -f docker-compose.e2e.yml down`;

if (existsSync(reportXmlPath)) {
  const xml = await file(reportXmlPath).text();
  const matches = [...xml.matchAll(/<testcase name="([^"]+)" classname="([^"]+)"(.*?)(\/>|>([\s\S]*?)<\/testcase>)/g)];
  
  let total = 0;
  let passed = 0;
  let failed = 0;
  
  const results = [];
  for (const match of matches) {
    const name = match[1];
    let suite = match[2];
    
    // Some Bun suites output the file name as classname, let's clean it up
    if (suite.includes(".test.ts")) {
      suite = suite.split("/").pop() || suite;
    }
    
    // Unescape XML entities for the markdown display
    suite = suite.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const nameUnescaped = name.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    
    const content = match[4];
    const isFailure = content.includes("<failure");
    
    total++;
    if (isFailure) {
      failed++;
    } else {
      passed++;
    }
    
    results.push({ name: nameUnescaped, suite, passed: !isFailure });
  }

  if (total > 0) {
    let md = `# E2E Test Execution Report\n\n`;
    md += `**Execution Time:** ${new Date().toLocaleString()}\n`;
    md += `**Total:** ${total} | **Passed:** ${passed} | **Failed:** ${failed}\n\n`;
    md += `| Status | Suite | Test |\n`;
    md += `|---|---|---|\n`;
    for (const r of results) {
      md += `| ${r.passed ? "✅ PASS" : "❌ FAIL"} | ${r.suite} | ${r.name} |\n`;
    }
    
    await Bun.write(reportMdPath, md);
    
    console.log("\n=======================================================");
    console.log(`📊 TEST REPORT GENERATED: ${reportMdPath}`);
    console.log("=======================================================");
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log("=======================================================\n");
  }
}

if (testResult.exitCode !== 0) {
  console.error("\n❌ E2E Tests Failed!");
  process.exit(testResult.exitCode);
} else {
  console.log("\n✅ E2E Tests Passed Successfully!");
  process.exit(0);
}
