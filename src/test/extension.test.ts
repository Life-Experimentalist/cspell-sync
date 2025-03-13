import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Test environment setup
const testDir = path.join(__dirname, "..", "..", "test-fixtures");
const testProjectDir = path.join(testDir, "test-project");
const testVSCodeDir = path.join(testProjectDir, ".vscode");
const testSettingsPath = path.join(testVSCodeDir, "settings.json");

// Setup function to create test files
function setupTestEnvironment() {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  if (!fs.existsSync(testProjectDir)) {
    fs.mkdirSync(testProjectDir, { recursive: true });
  }
  if (!fs.existsSync(testVSCodeDir)) {
    fs.mkdirSync(testVSCodeDir, { recursive: true });
  }
}

// Cleanup function
function cleanupTestEnvironment() {
  try {
    if (fs.existsSync(testDir)) {
      // Use a recursive deletion function or library here
      // For simplicity in this example, we're just acknowledging cleanup
      console.log(`Test cleanup: Would delete ${testDir}`);
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

suite("cSpell Sync Extension Tests", () => {
  setup(() => {
    setupTestEnvironment();
  });

  teardown(() => {
    cleanupTestEnvironment();
  });

  test("Extension should be activated", async () => {
    // This is a simple test to verify the extension activates properly
    const ext = vscode.extensions.getExtension("VKrishna04.cspell-sync");
    assert.ok(ext, "Extension should be found");

    if (ext) {
      await ext.activate();
      assert.strictEqual(ext.isActive, true, "Extension should be active");
    }
  });

  // Basic functionality test that doesn't rely on internal functions
  test("Extension exports expected commands", () => {
    const allCommands = vscode.commands.getCommands(true);
    return allCommands.then((commands) => {
      assert.ok(
        commands.includes("cspell-sync.syncWords"),
        "syncWords command should be registered"
      );
      assert.ok(
        commands.includes("cspell-sync.syncWordsToProject"),
        "syncWordsToProject command should be registered"
      );
      assert.ok(
        commands.includes("cspell-sync.syncCustomToGlobal"),
        "syncCustomToGlobal command should be registered"
      );
    });
  });
});
