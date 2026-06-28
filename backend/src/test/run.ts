import fs from "fs";
import path from "path";
import { suites } from "./framework.js";

// Force mock mode for automated test suites
delete process.env.GEMINI_API_KEY;
delete process.env.FIRESTORE_KEY_FILE;
process.env.MOCK_GEMINI = "true";
process.env.NODE_ENV = "test";
process.env.ENABLE_FIRESTORE = "false";

// Database paths
const dbDir = path.join(process.cwd(), "backend", "src", "db");
const dbPath = path.join(dbDir, "db.json");
const backupPath = path.join(dbDir, "db.json.bak");

async function runAllTests() {
  console.log("\n=======================================================");
  console.log("    GUARDIAN CORE - AUTOMATED TEST SUITE RUNNER");
  console.log("=======================================================");

  // 1. Back up database
  let dbBackedUp = false;
  if (fs.existsSync(dbPath)) {
    try {
      await fs.promises.copyFile(dbPath, backupPath);
      dbBackedUp = true;
      console.log(`[Backup] Successfully backed up database to: ${backupPath}`);
    } catch (err) {
      console.error("[Backup] Failed to create database backup:", err);
      process.exit(1);
    }
  }

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const startTime = Date.now();

  try {
    // 2. Eagerly import test modules to register suites
    console.log("[Runner] Importing test suites...");
    await import("./unit.test.js");
    await import("./integration.test.js");
    await import("./ai.test.js");
    await import("./operations.test.js");

    console.log(`[Runner] Registered ${suites.length} test suites.`);

    // 3. Loop through registered suites
    for (const suite of suites) {
      console.log(`\nSuite: ${suite.name}`);
      console.log("-".repeat(suite.name.length + 7));

      for (const test of suite.tests) {
        totalTests++;
        const testStartTime = Date.now();

        try {
          // Run beforeEach hooks
          for (const hook of suite.beforeEachHooks) {
            await hook();
          }

          // Run the test
          await test.fn();

          // Run afterEach hooks
          for (const hook of suite.afterEachHooks) {
            await hook();
          }

          const duration = Date.now() - testStartTime;
          console.log(`  ✔ [PASS] ${test.name} (${duration}ms)`);
          passedTests++;
        } catch (err: any) {
          const duration = Date.now() - testStartTime;
          console.error(`  ❌ [FAIL] ${test.name} (${duration}ms)`);
          console.error(`     Error: ${err.message}`);
          if (err.stack) {
            // Indent stack trace for readability
            console.error(err.stack.split("\n").map((line: string) => `       ${line}`).join("\n"));
          }

          // Try running afterEach hooks even on test failure
          try {
            for (const hook of suite.afterEachHooks) {
              await hook();
            }
          } catch (cleanErr) {
            console.error(`     [afterEach Error]:`, cleanErr);
          }

          failedTests++;
        }
      }
    }
  } catch (err) {
    console.error("[Runner] Fatal error occurred during test run execution:", err);
    failedTests = totalTests > 0 ? failedTests : 1;
  } finally {
    // 4. Restore database backup
    if (dbBackedUp && fs.existsSync(backupPath)) {
      try {
        await fs.promises.copyFile(backupPath, dbPath);
        await fs.promises.unlink(backupPath);
        console.log(`\n[Restore] Restored database backup successfully.`);
      } catch (err) {
        console.error("[Restore] Failed to restore database backup:", err);
      }
    } else if (!dbBackedUp && fs.existsSync(dbPath)) {
      // If there was no backup, clean up testing file
      try {
        await fs.promises.unlink(dbPath);
      } catch {}
    }

    // 5. Final Report
    const totalDuration = Date.now() - startTime;
    console.log("\n=======================================================");
    console.log("                    TEST RESULTS REPORT");
    console.log("=======================================================");
    console.log(`Total Run Duration: ${totalDuration}ms`);
    console.log(`Total Suites:       ${suites.length}`);
    console.log(`Total Tests Run:    ${totalTests}`);
    console.log(`Passed Tests:       \x1b[32m${passedTests}\x1b[0m`);
    console.log(`Failed Tests:       ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
    console.log("=======================================================\n");

    // Exit with appropriate exit code for CI Quality Gate
    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runAllTests().catch((err) => {
  console.error("[Runner] Unexpected startup crash:", err);
  process.exit(1);
});
