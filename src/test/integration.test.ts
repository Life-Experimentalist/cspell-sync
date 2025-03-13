import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Test workspace folder paths
const workspaceFolder = path.join(__dirname, "..", "..", "test-workspace");
const project1Folder = path.join(workspaceFolder, "project1");

// Setup directories and files needed for integration testing
function setupIntegrationTestEnvironment() {
  // Create basic test environment
  if (!fs.existsSync(workspaceFolder)) {
    fs.mkdirSync(workspaceFolder, { recursive: true });
  }
  if (!fs.existsSync(project1Folder)) {
    fs.mkdirSync(project1Folder, { recursive: true });
  }

  // Create settings directory
  const vscodeDir = path.join(project1Folder, ".vscode");
  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  // Create basic settings file
  const settings = {
    "cSpell.words": ["testword1", "testword2"],
  };
  fs.writeFileSync(
    path.join(vscodeDir, "settings.json"),
    JSON.stringify(settings, null, 2),
    "utf8"
  );
}

// Cleanup function
function cleanupIntegrationTestEnvironment() {
  try {
    if (fs.existsSync(workspaceFolder)) {
      console.log(`Integration test cleanup: Would delete ${workspaceFolder}`);
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

suite("cSpell Sync Integration Tests", () => {
  suiteSetup(() => {
    setupIntegrationTestEnvironment();
  });

  suiteTeardown(() => {
    cleanupIntegrationTestEnvironment();
  });

  test("Basic test environment setup", () => {
    // Simple test to verify test environment is working
    const settingsPath = path.join(project1Folder, ".vscode", "settings.json");
    assert.ok(fs.existsSync(settingsPath), "Settings file should exist");

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(
      Array.isArray(settings["cSpell.words"]),
      "Settings should have cSpell.words array"
    );
  });
});
