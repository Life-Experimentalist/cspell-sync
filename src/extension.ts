import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// Interfaces and Types
interface DictionaryJson {
  words: unknown[];
}

interface CachedSettings {
  content: any;
  timestamp: number;
}

type WordProcessor = () => Promise<number>;

// Constants
const CONFIG_CACHE_TTL = 60000; // 1 minute
const SETTINGS_CACHE_TTL = 30000; // 30 seconds
const DEBOUNCE_DEFAULT_DELAY = 1000; // 1 second

// Source synchronization settings keys
const CONFIG_KEYS = {
  SYNC_COMBINED_TXT: "syncCombinedTxt",
  SYNC_PROJECT_SETTINGS: "syncProjectSettings",
  SYNC_CUSTOM_DICTIONARIES: "syncCustomDictionaries",
  SYNC_LANGUAGE_SETTINGS: "syncLanguageSettings",
  BIDIRECTIONAL_SYNC_MODE: "bidirectionalSyncMode",
  PROJECT_LEVEL_SYNC: "projectLevelSync",
  CUSTOM_DICTIONARY_SYNC: "customDictionarySync",
  WORKSPACE_SYNC: "workspaceSync",
  NEW_DICTIONARY_SYNC: "newDictionarySync",
  CUSTOM_TO_GLOBAL_SYNC: "customToGlobalSync",
};

// Output Channel Management
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("cSpell Sync");
  }
  return outputChannel;
}

// Configuration Cache
const configCache = new Map<string, any>();
const configCacheTime = new Map<string, number>();

function getConfig<T>(key: string): T {
  const now = Date.now();
  const cachedTime = configCacheTime.get(key);

  if (
    cachedTime &&
    now - cachedTime < CONFIG_CACHE_TTL &&
    configCache.has(key)
  ) {
    return configCache.get(key) as T;
  }

  const value = vscode.workspace.getConfiguration("cspell-sync").get<T>(key)!;
  configCache.set(key, value);
  configCacheTime.set(key, now);
  return value;
}

function clearConfigCache() {
  configCache.clear();
  configCacheTime.clear();
}

// Logging and Notifications
function log(message: string): void {
  if (getConfig<boolean>("logToOutputChannel")) {
    getOutputChannel().appendLine(message);
  }
}

function showNotification(message: string): void {
  if (getConfig<boolean>("showNotifications")) {
    vscode.window.showInformationMessage(message);
  }
}

// State Management
const processedFolders = new Set<string>();
const promptedCombinedFiles = new Set<string>();
const watchingCombinedFiles = new Set<string>();
const pendingFileChanges = new Map<string, NodeJS.Timeout>();
const settingsCache = new Map<string, CachedSettings>();
let combinedWatcher: vscode.FileSystemWatcher | undefined;
let settingsWatcher: vscode.FileSystemWatcher | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

// Debounce Utility
function debounceFileChange(
  filePath: string,
  callback: () => void,
  delay = DEBOUNCE_DEFAULT_DELAY
): void {
  const existing = pendingFileChanges.get(filePath);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(() => {
    callback();
    pendingFileChanges.delete(filePath);
  }, delay);

  pendingFileChanges.set(filePath, timeoutId);
}

// Status Bar Management
function createStatusBarItem(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = "cspell-sync.syncWords";
    statusBarItem.tooltip = "Sync cSpell Dictionary";
    statusBarItem.text = "$(sync) cSpell Sync";
    statusBarItem.hide();
  }
  return statusBarItem;
}

async function showSyncOperation<T>(
  operationText: string,
  operation: () => Promise<T>,
  hideAfterMs = 2000
): Promise<T> {
  const statusBar = createStatusBarItem();
  statusBar.text = `$(sync~spin) ${operationText}`;
  statusBar.show();

  try {
    const result = await operation();
    statusBar.text = `$(check) ${operationText} - Complete`;
    setTimeout(() => {
      if (statusBar) {
        statusBar.text = "$(sync) cSpell Sync";
      }
    }, hideAfterMs);
    return result;
  } catch (error) {
    statusBar.text = `$(error) ${operationText} - Failed`;
    setTimeout(() => {
      if (statusBar) {
        statusBar.text = "$(sync) cSpell Sync";
      }
    }, hideAfterMs);
    throw error;
  }
}

// Extension Lifecycle
export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  console.log("cSpell Sync extension is now active");

  const syncCommand = vscode.commands.registerCommand(
    "cspell-sync.syncWords",
    () => {
      log("Manual sync triggered");
      if (getConfig<boolean>("logToOutputChannel")) {
        getOutputChannel().show();
      }
      settingsCache.clear();
      processedFolders.clear();
      syncCSpellWords();
    }
  );

  context.subscriptions.push(syncCommand);

  // Add bidirectional sync command
  const bidirectionalSyncCommand = vscode.commands.registerCommand(
    "cspell-sync.syncWordsToProject",
    () => {
      log("Manual bidirectional sync triggered");
      if (getConfig<boolean>("logToOutputChannel")) {
        getOutputChannel().show();
      }
      syncWordsToProject();
    }
  );

  context.subscriptions.push(bidirectionalSyncCommand);

  // Add command to sync custom dictionaries to global
  const customToGlobalSyncCommand = vscode.commands.registerCommand(
    "cspell-sync.syncCustomToGlobal",
    () => {
      log("Manual custom dictionary to global sync triggered");
      if (getConfig<boolean>("logToOutputChannel")) {
        getOutputChannel().show();
      }
      syncCustomDictionariesToGlobalCommand();
    }
  );

  context.subscriptions.push(customToGlobalSyncCommand);

  // Track changes to global dictionary for automatic bidirectional sync
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cspell-sync")) {
        clearConfigCache();
      }

      // If global cSpell dictionary changed and automatic bidirectional sync is enabled
      if (e.affectsConfiguration("cSpell.userWords")) {
        const syncMode = getConfig<string>(CONFIG_KEYS.BIDIRECTIONAL_SYNC_MODE);
        if (syncMode === "automatic") {
          log(
            "Global dictionary changed, running automatic bidirectional sync"
          );
          syncWordsToProject();
        }
      }
    })
  );

  if (
    getConfig<boolean>("autoSyncOnStartup") &&
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const initialSyncDelay = getConfig<number>("initialSyncDelay");
    log(`Initial sync scheduled in ${initialSyncDelay}ms`);
    setTimeout(syncCSpellWords, initialSyncDelay);
  }

  const workspaceFoldersListener = vscode.workspace.onDidChangeWorkspaceFolders(
    () => {
      log("Workspace folders changed, running sync");
      syncCSpellWords();
    }
  );

  context.subscriptions.push(workspaceFoldersListener);
  context.subscriptions.push({ dispose: disposeFileWatchers });

  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    setupFileWatchers();
  }

  const statusBar = createStatusBarItem();
  context.subscriptions.push(statusBar);
  setTimeout(() => statusBar.show(), 1000);
}

function setupFileWatchers() {
  // Only set up the combined watcher if configured to process them
  if (getConfig<boolean>(CONFIG_KEYS.SYNC_COMBINED_TXT)) {
    setupCombinedWatcher();
  }

  // Only set up the settings watcher if configured to process them
  if (getConfig<boolean>(CONFIG_KEYS.SYNC_PROJECT_SETTINGS)) {
    setupSettingsWatcher();
  }
}

function setupCombinedWatcher() {
  if (combinedWatcher) {
    return;
  }

  combinedWatcher = vscode.workspace.createFileSystemWatcher("**/combined.txt");

  combinedWatcher.onDidCreate((uri) => {
    const filePath = uri.fsPath;
    log(`Detected new combined.txt: ${filePath}`);
    handleCombinedTxtFileCreation(filePath);
  });

  if (extensionContext) {
    extensionContext.subscriptions.push(combinedWatcher);
  }
}

function setupSettingsWatcher() {
  if (settingsWatcher) {
    return;
  }

  settingsWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/settings.json"
  );

  settingsWatcher.onDidChange((uri) => {
    const filePath = uri.fsPath;
    debounceFileChange(filePath, () => {
      log(`Processing changes in settings.json: ${filePath}`);
      const folderPath = path.dirname(path.dirname(filePath));
      settingsCache.delete(filePath);
      processSettingsFile(folderPath).then((wordsAdded) => {
        if (wordsAdded > 0) {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
          const folderName = workspaceFolder
            ? workspaceFolder.name
            : "unknown folder";
          log(
            `Added ${wordsAdded} word(s) from updated settings.json in ${folderName}`
          );
          showNotification(
            `Added ${wordsAdded} new word(s) to global cSpell dictionary from settings.json`
          );
        }
      });
    });
  });

  settingsWatcher.onDidCreate((uri) => {
    const filePath = uri.fsPath;
    log(`Detected new settings.json: ${filePath}`);
    const folderPath = path.dirname(path.dirname(filePath));
    processSettingsFile(folderPath).then((wordsAdded) => {
      if (wordsAdded > 0) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const folderName = workspaceFolder
          ? workspaceFolder.name
          : "unknown folder";
        log(
          `Added ${wordsAdded} word(s) from new settings.json in ${folderName}`
        );
        showNotification(
          `Added ${wordsAdded} new word(s) to global cSpell dictionary from settings.json`
        );
      }
    });
  });

  if (extensionContext) {
    extensionContext.subscriptions.push(settingsWatcher);
  }
}

function disposeFileWatchers() {
  if (combinedWatcher) {
    combinedWatcher.dispose();
    combinedWatcher = undefined;
  }
  if (settingsWatcher) {
    settingsWatcher.dispose();
    settingsWatcher = undefined;
  }
}

async function handleCombinedTxtFileCreation(filePath: string): Promise<void> {
  // Early return if this feature is disabled
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_COMBINED_TXT)) {
    return;
  }

  if (watchingCombinedFiles.has(filePath)) {
    return;
  }

  watchingCombinedFiles.add(filePath);

  try {
    const waitTime = getConfig<number>("combinedFileWaitTime");
    log(`Waiting ${waitTime}ms before checking combined.txt file...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    if (fs.existsSync(filePath) && !promptedCombinedFiles.has(filePath)) {
      promptedCombinedFiles.add(filePath);
      const folderPath = path.dirname(filePath);
      const folderSettings = getFolderSettings(folderPath);

      if (
        folderSettings &&
        folderSettings["cspell-sync.combined-auto-remove"] === false
      ) {
        log(`Config set to keep combined.txt in ${folderPath}`);
        watchingCombinedFiles.delete(filePath);
        return;
      }

      if (getConfig<boolean>("showNotifications")) {
        const processOption = "Process and Remove";
        const keepOption = "Keep (don't process automatically)";

        const selection = await vscode.window.showInformationMessage(
          "A combined.txt file was detected. What would you like to do with it?",
          processOption,
          keepOption
        );

        if (selection === processOption) {
          const wordsAdded = await processCombinedTxtFile(folderPath);
          log(
            `Processed user-requested combined.txt, added ${wordsAdded} words`
          );
        } else if (selection === keepOption) {
          await updateFolderSettings(folderPath, {
            "cspell-sync.combined-auto-remove": false,
          });
          log(`Set combined.txt in ${folderPath} to be kept`);
        }
      } else {
        const wordsAdded = await processCombinedTxtFile(folderPath);
        log(`Auto-processed combined.txt, added ${wordsAdded} words`);
      }
    }
  } catch (error) {
    log(
      `Error handling combined.txt: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    watchingCombinedFiles.delete(filePath);
  }
}

function getFolderSettings(folderPath: string): any {
  const settingsPath = path.join(folderPath, ".vscode", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  try {
    const now = Date.now();
    const cached = settingsCache.get(settingsPath);
    if (cached && now - cached.timestamp < SETTINGS_CACHE_TTL) {
      return cached.content;
    }

    const content = fs.readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(content);
    settingsCache.set(settingsPath, { content: settings, timestamp: now });
    return settings;
  } catch (error) {
    log(
      `Error reading settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function updateFolderSettings(
  folderPath: string,
  settingsToUpdate: Record<string, any>
): Promise<void> {
  const vscodeDir = path.join(folderPath, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");

  try {
    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    // Read existing settings or create new object
    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf8");
      settings = JSON.parse(content);
    }

    // Update settings and write back
    settings = { ...settings, ...settingsToUpdate };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), "utf8");

    // Update cache
    settingsCache.set(settingsPath, {
      content: settings,
      timestamp: Date.now(),
    });
  } catch (error) {
    log(
      `Error writing settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function syncCSpellWords(): Promise<void> {
  return showSyncOperation("Syncing Words", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log("No workspace folders found");
      return;
    }

    setupFileWatchers();

    log(`Found ${workspaceFolders.length} workspace folder(s)`);
    let totalWordsAdded = 0;

    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      log(`Processing folder: ${folderPath} (${folder.name})`);

      if (processedFolders.has(folderPath)) {
        log(`Skipping already processed folder: ${folderPath}`);
        continue;
      }

      processedFolders.add(folderPath);

      // Get configurations for each source type
      const syncSettings = getConfig<boolean>(
        CONFIG_KEYS.SYNC_PROJECT_SETTINGS
      );
      const syncDicts = getConfig<boolean>(
        CONFIG_KEYS.SYNC_CUSTOM_DICTIONARIES
      );
      const syncLang = getConfig<boolean>(CONFIG_KEYS.SYNC_LANGUAGE_SETTINGS);
      const syncCombined = getConfig<boolean>(CONFIG_KEYS.SYNC_COMBINED_TXT);
      const syncCustomToGlobal = getConfig<boolean>(
        CONFIG_KEYS.CUSTOM_TO_GLOBAL_SYNC
      );

      // Process only the enabled word sources
      const processPromises = [];

      if (syncSettings) {
        processPromises.push(processSettingsFile(folderPath));
      } else {
        processPromises.push(Promise.resolve(0));
      }

      if (syncDicts) {
        processPromises.push(processCustomDictionaries(folderPath));
      } else {
        processPromises.push(Promise.resolve(0));
      }

      if (syncLang) {
        processPromises.push(processLanguageSettings(folderPath));
      } else {
        processPromises.push(Promise.resolve(0));
      }

      if (syncCombined) {
        processPromises.push(processFolderCombinedTxt(folderPath));
      } else {
        processPromises.push(Promise.resolve(0));
      }

      // Add custom dictionary to global sync if enabled
      if (syncCustomToGlobal) {
        processPromises.push(syncCustomDictionariesToGlobal(folderPath));
      } else {
        processPromises.push(Promise.resolve(0));
      }

      // Process all word sources in parallel for better performance
      const [
        settingsWordsAdded,
        dictWordsAdded,
        langWordsAdded,
        combinedWordsAdded,
        customToGlobalAdded,
      ] = await Promise.all(processPromises);

      if (settingsWordsAdded > 0) {
        log(
          `Added ${settingsWordsAdded} word(s) from settings.json in ${folder.name}`
        );
      }

      if (dictWordsAdded > 0) {
        log(
          `Added ${dictWordsAdded} word(s) from custom dictionaries in ${folder.name}`
        );
      }

      if (langWordsAdded > 0) {
        log(
          `Added ${langWordsAdded} word(s) from language-specific settings in ${folder.name}`
        );
      }

      if (combinedWordsAdded > 0) {
        log(
          `Added ${combinedWordsAdded} word(s) from combined.txt in ${folder.name}`
        );
      }

      if (customToGlobalAdded > 0) {
        log(
          `Added ${customToGlobalAdded} word(s) from custom dictionaries to global dictionary from ${folder.name}`
        );
      }

      totalWordsAdded +=
        settingsWordsAdded +
        dictWordsAdded +
        langWordsAdded +
        combinedWordsAdded +
        customToGlobalAdded;
    }

    if (totalWordsAdded > 0) {
      log(
        `Total: Added ${totalWordsAdded} new word(s) to global cSpell dictionary`
      );
      showNotification(
        `Added ${totalWordsAdded} new word(s) to global cSpell dictionary`
      );
    } else {
      log("No new words added to dictionary");
    }
  });
}

// Helper to process combined.txt during folder processing
async function processFolderCombinedTxt(folderPath: string): Promise<number> {
  // Check global settings first
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_COMBINED_TXT)) {
    log(`Combined.txt sync is globally disabled, skipping for ${folderPath}`);
    return 0;
  }

  // Then check folder-specific settings
  const folderSettings = getFolderSettings(folderPath);
  const autoRemove = folderSettings
    ? folderSettings["cspell-sync.combined-auto-remove"] !== false
    : true;

  if (!autoRemove) {
    log(`Auto-remove is disabled for ${folderPath}, skipping combined.txt`);
    return 0;
  }

  const combinedFilePath = path.join(folderPath, "combined.txt");
  if (
    fs.existsSync(combinedFilePath) &&
    !promptedCombinedFiles.has(combinedFilePath)
  ) {
    log(`Found combined.txt in ${folderPath}`);
    return await processCombinedTxtFile(folderPath);
  }

  return 0;
}

// Consolidated word processing function
async function addWordsToGlobalDictionary(words: string[]): Promise<number> {
  if (!words || words.length === 0) {
    return 0;
  }

  const userConfig = vscode.workspace.getConfiguration();
  const userWords = userConfig.get<string[]>("cSpell.userWords") || [];
  const userWordsSet = new Set(userWords);

  const wordsToAdd = words.filter(
    (word) =>
      word &&
      typeof word === "string" &&
      word.trim().length > 0 &&
      !userWordsSet.has(word)
  );

  if (wordsToAdd.length > 0) {
    // Sort all words alphabetically
    const newUserWords = [...userWords, ...wordsToAdd].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    await userConfig.update(
      "cSpell.userWords",
      newUserWords,
      vscode.ConfigurationTarget.Global
    );
    return wordsToAdd.length;
  }

  return 0;
}

async function processSettingsFile(folderPath: string): Promise<number> {
  // Check if this source is enabled
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_PROJECT_SETTINGS)) {
    return 0;
  }

  try {
    const settings = getFolderSettings(folderPath);
    if (
      !settings ||
      !settings["cSpell.words"] ||
      !Array.isArray(settings["cSpell.words"])
    ) {
      return 0;
    }

    const projectWords = settings["cSpell.words"] as string[];
    return await addWordsToGlobalDictionary(projectWords);
  } catch (error) {
    log(
      `Error processing settings in ${folderPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

async function processCombinedTxtFile(folderPath: string): Promise<number> {
  // Check if this source is enabled
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_COMBINED_TXT)) {
    return 0;
  }

  const combinedFilePath = path.join(folderPath, "combined.txt");
  if (!fs.existsSync(combinedFilePath)) {
    return 0;
  }

  try {
    const fileContent = fs.readFileSync(combinedFilePath, "utf8");
    const words = fileContent
      .split(/[\n\r,\s]+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    if (words.length === 0) {
      fs.unlinkSync(combinedFilePath);
      return 0;
    }

    const wordsAdded = await addWordsToGlobalDictionary(words);
    fs.unlinkSync(combinedFilePath);
    return wordsAdded;
  } catch (error) {
    log(
      `Error processing ${combinedFilePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

async function processCustomDictionaries(folderPath: string): Promise<number> {
  // Check if this source is enabled
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_CUSTOM_DICTIONARIES)) {
    return 0;
  }

  try {
    const settings = getFolderSettings(folderPath);
    if (!settings || !settings["cSpell.customDictionaries"]) {
      return 0;
    }

    const customDictionaries = settings["cSpell.customDictionaries"];
    if (typeof customDictionaries !== "object") {
      return 0;
    }

    log(`Found custom dictionaries in ${folderPath}`);
    let allDictionaryWords: string[] = [];

    // Process all dictionaries and collect words
    const dictionaryProcessingPromises = Object.entries(customDictionaries).map(
      async ([dictName, dictConfig]) => {
        const dict = dictConfig as any;
        if (!dict.path || typeof dict.path !== "string") {
          return [];
        }

        const dictPath = dict.path
          .replace(/\$\{workspaceFolder\}/g, folderPath)
          .replace(/\$\{workspace\}/g, folderPath);

        log(`Processing dictionary: ${dictName} at ${dictPath}`);

        if (!fs.existsSync(dictPath)) {
          log(`Dictionary file not found: ${dictPath}`);
          return [];
        }

        try {
          const fileContent = fs.readFileSync(dictPath, "utf8");

          if (dictPath.endsWith(".txt")) {
            return fileContent
              .split(/[\n\r]+/)
              .map((w) => w.trim())
              .filter((w) => w.length > 0 && !w.startsWith("#"));
          } else if (dictPath.endsWith(".json")) {
            const jsonData = JSON.parse(fileContent);
            if (Array.isArray(jsonData.words)) {
              return (jsonData as DictionaryJson).words.filter(
                (w): w is string => typeof w === "string"
              );
            } else if (Array.isArray(jsonData)) {
              return jsonData.filter((w) => typeof w === "string");
            }
          }

          return [];
        } catch (error) {
          log(
            `Error processing dictionary ${dictName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      }
    );

    // Wait for all dictionary processing to complete
    const dictWordArrays = await Promise.all(dictionaryProcessingPromises);

    // Flatten the array of arrays into a single array
    dictWordArrays.forEach((words) => {
      allDictionaryWords = [...allDictionaryWords, ...words];
    });

    return await addWordsToGlobalDictionary(allDictionaryWords);
  } catch (error) {
    log(
      `Error processing custom dictionaries: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

async function processLanguageSettings(folderPath: string): Promise<number> {
  // Check if this source is enabled
  if (!getConfig<boolean>(CONFIG_KEYS.SYNC_LANGUAGE_SETTINGS)) {
    return 0;
  }

  try {
    const settings = getFolderSettings(folderPath);
    if (
      !settings ||
      !settings["cSpell.languageSettings"] ||
      !Array.isArray(settings["cSpell.languageSettings"])
    ) {
      return 0;
    }

    const languageSettings = settings["cSpell.languageSettings"];
    log(`Found language-specific settings in ${folderPath}`);

    let allLangWords: string[] = [];

    // Extract words from all language settings
    for (const langSetting of languageSettings) {
      if (!langSetting || typeof langSetting !== "object") {
        continue;
      }

      if (Array.isArray(langSetting.words)) {
        const langWords = langSetting.words.filter(
          (word: unknown): word is string =>
            typeof word === "string" && word.trim().length > 0
        );

        if (langWords.length > 0) {
          log(
            `Found ${langWords.length} words in language setting for ${
              langSetting.languageId || "unknown language"
            }`
          );
          allLangWords.push(...langWords);
        }
      }
    }

    return await addWordsToGlobalDictionary(allLangWords);
  } catch (error) {
    log(
      `Error processing language settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

async function syncWordsToProject(): Promise<void> {
  // Check if bidirectional sync is completely disabled
  const syncMode = getConfig<string>(CONFIG_KEYS.BIDIRECTIONAL_SYNC_MODE);
  if (syncMode === "disabled") {
    log("Bidirectional sync is disabled in settings");
    showNotification("Bidirectional sync is disabled in extension settings");
    return;
  }

  return showSyncOperation("Syncing to Projects", async () => {
    log(`Starting sync from global to projects`);
    const userConfig = vscode.workspace.getConfiguration();
    const userWords = userConfig.get<string[]>("cSpell.userWords") || [];

    if (userWords.length === 0) {
      log("No words in global dictionary to sync");
      showNotification("No words in global dictionary to sync to project");
      return;
    }

    log(`Found ${userWords.length} words in global dictionary`);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log("No workspace folders found");
      return;
    }

    let totalWordsAdded = 0;
    let totalProjectsUpdated = 0;

    // Get sync configuration
    const projectLevelSync = getConfig<{ enabled: boolean; target: string }>(
      CONFIG_KEYS.PROJECT_LEVEL_SYNC
    );
    const customDictSync = getConfig<{
      enabled: boolean;
      dictionaryName: string;
    }>(CONFIG_KEYS.CUSTOM_DICTIONARY_SYNC);
    const workspaceSync = getConfig<{ enabled: boolean; target: string }>(
      CONFIG_KEYS.WORKSPACE_SYNC
    );
    const newDictSync = getConfig<{
      enabled: boolean;
      name: string;
      format: "txt" | "json";
    }>(CONFIG_KEYS.NEW_DICTIONARY_SYNC);

    // Process workspace-level settings if enabled
    if (workspaceSync.enabled) {
      try {
        log("Processing workspace-level settings");
        const workspaceConfig = vscode.workspace.getConfiguration();
        const workspaceWords =
          workspaceConfig.get<string[]>(workspaceSync.target) || [];
        const workspaceWordsSet = new Set(workspaceWords);
        const wordsToAdd = userWords.filter(
          (word) => !workspaceWordsSet.has(word)
        );

        if (wordsToAdd.length > 0) {
          // Sort alphabetically with locale-aware comparison
          const newWorkspaceWords = [...workspaceWords, ...wordsToAdd].sort(
            (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
          );
          await workspaceConfig.update(
            workspaceSync.target,
            newWorkspaceWords,
            vscode.ConfigurationTarget.Workspace
          );
          log(
            `Added ${wordsToAdd.length} words to workspace ${workspaceSync.target}`
          );
          totalWordsAdded += wordsToAdd.length;
          totalProjectsUpdated++;
        } else {
          log(`No new words to add to workspace ${workspaceSync.target}`);
        }
      } catch (error) {
        log(
          `Error syncing words to workspace: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Process all workspace folders in parallel
    const folderResults = await Promise.all(
      workspaceFolders.map(async (folder) => {
        const folderPath = folder.uri.fsPath;
        log(`Processing project in folder: ${folderPath} (${folder.name})`);

        const folderSettings = getFolderSettings(folderPath);
        if (
          folderSettings &&
          folderSettings["cspell-sync.enableBidirectionalSync"] === false
        ) {
          log(`Bidirectional sync disabled for ${folder.name}, skipping`);
          return { wordsAdded: 0, updated: false };
        }

        let totalFolderWordsAdded = 0;
        let folderUpdated = false;

        // Project-level sync to settings.json
        if (projectLevelSync.enabled) {
          try {
            const vscodeDir = path.join(folderPath, ".vscode");
            const settingsPath = path.join(vscodeDir, "settings.json");

            if (!fs.existsSync(vscodeDir)) {
              fs.mkdirSync(vscodeDir, { recursive: true });
            }

            let settings: Record<string, any> = {};
            if (fs.existsSync(settingsPath)) {
              const content = fs.readFileSync(settingsPath, "utf8");
              settings = JSON.parse(content);
            }

            const targetSetting = projectLevelSync.target;
            const projectWords = Array.isArray(settings[targetSetting])
              ? settings[targetSetting]
              : [];
            const projectWordsSet = new Set(projectWords);
            const wordsToAdd = userWords.filter(
              (word) => !projectWordsSet.has(word)
            );

            if (wordsToAdd.length > 0) {
              // Sort alphabetically with locale-aware comparison
              settings[targetSetting] = [...projectWords, ...wordsToAdd].sort(
                (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
              );
              fs.writeFileSync(
                settingsPath,
                JSON.stringify(settings, null, 4),
                "utf8"
              );
              log(
                `Added ${wordsToAdd.length} words to ${targetSetting} in ${folder.name}`
              );

              // Update the settings cache
              settingsCache.set(settingsPath, {
                content: settings,
                timestamp: Date.now(),
              });

              totalFolderWordsAdded += wordsToAdd.length;
              folderUpdated = true;
            } else {
              log(`No new words to add to ${targetSetting} in ${folder.name}`);
            }
          } catch (error) {
            log(
              `Error syncing words to project ${folder.name}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Custom dictionary sync
        if (customDictSync.enabled && customDictSync.dictionaryName) {
          try {
            const settings = getFolderSettings(folderPath);
            if (settings && settings["cSpell.customDictionaries"]) {
              const dictionaries = settings["cSpell.customDictionaries"];
              const targetDict = dictionaries[customDictSync.dictionaryName];

              if (targetDict && targetDict.path) {
                const dictPath = targetDict.path
                  .replace(/\$\{workspaceFolder\}/g, folderPath)
                  .replace(/\$\{workspace\}/g, folderPath);

                log(`Syncing to custom dictionary at ${dictPath}`);

                let dictWords: string[] = [];
                if (fs.existsSync(dictPath)) {
                  // Load existing dictionary
                  if (dictPath.endsWith(".txt")) {
                    const content = fs.readFileSync(dictPath, "utf8");
                    dictWords = content
                      .split(/[\n\r]+/)
                      .map((w) => w.trim())
                      .filter((w) => w.length > 0 && !w.startsWith("#"));
                  } else if (dictPath.endsWith(".json")) {
                    const content = fs.readFileSync(dictPath, "utf8");
                    const jsonData = JSON.parse(content);
                    if (Array.isArray(jsonData.words)) {
                      dictWords = (jsonData as DictionaryJson).words.filter(
                        (w): w is string => typeof w === "string"
                      );
                    } else if (Array.isArray(jsonData)) {
                      dictWords = jsonData.filter((w) => typeof w === "string");
                    }
                  }
                }

                // Find words to add
                const dictWordsSet = new Set(dictWords);
                const wordsToAdd = userWords.filter(
                  (word) => !dictWordsSet.has(word)
                );

                if (wordsToAdd.length > 0) {
                  // Sort alphabetically with locale-aware comparison
                  const newDictWords = [...dictWords, ...wordsToAdd].sort(
                    (a, b) =>
                      a.localeCompare(b, undefined, { sensitivity: "base" })
                  );

                  // Write back to file
                  if (dictPath.endsWith(".txt")) {
                    fs.writeFileSync(dictPath, newDictWords.join("\n"), "utf8");
                  } else if (dictPath.endsWith(".json")) {
                    const jsonContent = { words: newDictWords };
                    fs.writeFileSync(
                      dictPath,
                      JSON.stringify(jsonContent, null, 2),
                      "utf8"
                    );
                  }

                  log(
                    `Added ${wordsToAdd.length} words to custom dictionary ${customDictSync.dictionaryName}`
                  );
                  totalFolderWordsAdded += wordsToAdd.length;
                  folderUpdated = true;
                } else {
                  log(
                    `No new words to add to custom dictionary ${customDictSync.dictionaryName}`
                  );
                }
              } else {
                log(
                  `Custom dictionary ${customDictSync.dictionaryName} not found in ${folder.name}`
                );
              }
            }
          } catch (error) {
            log(
              `Error syncing words to custom dictionary in ${folder.name}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Create new dictionary if enabled
        if (newDictSync.enabled && newDictSync.name) {
          try {
            log(
              `Creating/updating new dictionary ${newDictSync.name} in ${folder.name}`
            );
            const created = await createNewDictionary(
              folderPath,
              newDictSync.name,
              userWords,
              newDictSync.format
            );

            if (created) {
              log(
                `Successfully created/updated dictionary ${newDictSync.name} in ${folder.name}`
              );
              folderUpdated = true;
              totalFolderWordsAdded += userWords.length; // This is approximate as we don't track exact additions
            }
          } catch (error) {
            log(
              `Error creating new dictionary in ${folder.name}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        return { wordsAdded: totalFolderWordsAdded, updated: folderUpdated };
      })
    );

    // Aggregate results
    folderResults.forEach((result) => {
      if (result.updated) {
        totalProjectsUpdated++;
        totalWordsAdded += result.wordsAdded;
      }
    });

    if (totalProjectsUpdated > 0) {
      const message = `Added ${totalWordsAdded} global words to ${totalProjectsUpdated} project(s)`;
      log(message);
      showNotification(message);
    } else {
      log("No projects were updated");
      showNotification("All projects are up to date with global dictionary");
    }
  });
}

export function deactivate() {
  // Clean up all resources and state
  configCache.clear();
  configCacheTime.clear();
  settingsCache.clear();
  processedFolders.clear();
  promptedCombinedFiles.clear();
  watchingCombinedFiles.clear();

  // Clear pending timeouts
  for (const timeout of pendingFileChanges.values()) {
    clearTimeout(timeout);
  }
  pendingFileChanges.clear();

  disposeFileWatchers();

  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = undefined;
  }

  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}

// Helper function to create a new dictionary file
async function createNewDictionary(
  folderPath: string,
  dictionaryName: string,
  words: string[],
  format: "txt" | "json" = "json"
): Promise<boolean> {
  try {
    // Create dictionaries folder if it doesn't exist
    const dictionariesDir = path.join(folderPath, "dictionaries");
    if (!fs.existsSync(dictionariesDir)) {
      fs.mkdirSync(dictionariesDir, { recursive: true });
    }

    // Create file path
    const fileName = dictionaryName.endsWith(`.${format}`)
      ? dictionaryName
      : `${dictionaryName}.${format}`;
    const dictPath = path.join(dictionariesDir, fileName);

    // Check if file exists
    if (fs.existsSync(dictPath)) {
      log(`Dictionary ${dictPath} already exists. Appending words.`);
      let existingWords: string[] = [];

      if (format === "txt") {
        const content = fs.readFileSync(dictPath, "utf8");
        existingWords = content
          .split(/[\n\r]+/)
          .map((w) => w.trim())
          .filter((w) => w.length > 0 && !w.startsWith("#"));
      } else {
        const content = fs.readFileSync(dictPath, "utf8");
        try {
          const jsonData = JSON.parse(content);
          if (Array.isArray(jsonData.words)) {
            existingWords = jsonData.words.filter(
              (w: unknown): w is string => typeof w === "string"
            );
          } else if (Array.isArray(jsonData)) {
            existingWords = jsonData.filter((w) => typeof w === "string");
          }
        } catch (e) {
          log(`Error parsing existing dictionary: ${e}`);
          existingWords = [];
        }
      }

      // Merge words and sort alphabetically
      const existingWordsSet = new Set(existingWords);
      const wordsToAdd = words.filter((w) => !existingWordsSet.has(w));
      const allWords = [...existingWords, ...wordsToAdd].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );

      // Write to file
      if (format === "txt") {
        fs.writeFileSync(dictPath, allWords.join("\n"), "utf8");
      } else {
        const jsonContent = { words: allWords };
        fs.writeFileSync(
          dictPath,
          JSON.stringify(jsonContent, null, 2),
          "utf8"
        );
      }

      log(
        `Added ${wordsToAdd.length} words to existing dictionary ${dictPath}`
      );
      return wordsToAdd.length > 0;
    } else {
      // Create new file with sorted words
      const sortedWords = [...words].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );

      if (format === "txt") {
        fs.writeFileSync(dictPath, sortedWords.join("\n"), "utf8");
      } else {
        const jsonContent = { words: sortedWords };
        fs.writeFileSync(
          dictPath,
          JSON.stringify(jsonContent, null, 2),
          "utf8"
        );
      }

      log(`Created new dictionary ${dictPath} with ${words.length} words`);

      // Update cSpell settings to include this dictionary
      await updateCSpellSettingsWithDictionary(
        folderPath,
        dictionaryName,
        dictPath
      );

      return true;
    }
  } catch (error) {
    log(
      `Error creating dictionary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Helper to update cSpell settings with a new dictionary
async function updateCSpellSettingsWithDictionary(
  folderPath: string,
  dictionaryName: string,
  dictionaryPath: string
): Promise<void> {
  const vscodeDir = path.join(folderPath, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");

  try {
    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    // Read existing settings or create new object
    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf8");
      settings = JSON.parse(content);
    }

    // Get existing dictionaries or create new object
    if (!settings["cSpell.customDictionaries"]) {
      settings["cSpell.customDictionaries"] = {};
    }

    // Calculate relative path for dictionary
    const relativeDictPath = dictionaryPath.replace(
      folderPath,
      "${workspaceFolder}"
    );

    // Update dictionary reference
    settings["cSpell.customDictionaries"][dictionaryName] = {
      name: dictionaryName,
      path: relativeDictPath,
      addWords: true,
      scope: "workspace",
    };

    // Add dictionary to list of enabled dictionaries if not already included
    if (!settings["cSpell.dictionaries"]) {
      settings["cSpell.dictionaries"] = [];
    }

    if (!Array.isArray(settings["cSpell.dictionaries"])) {
      settings["cSpell.dictionaries"] = [];
    }

    const dictionaries = settings["cSpell.dictionaries"] as string[];
    if (!dictionaries.includes(dictionaryName)) {
      dictionaries.push(dictionaryName);
      settings["cSpell.dictionaries"] = dictionaries;
    }

    // Write back settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), "utf8");

    // Update cache
    settingsCache.set(settingsPath, {
      content: settings,
      timestamp: Date.now(),
    });

    log(`Updated cSpell settings with new dictionary ${dictionaryName}`);
  } catch (error) {
    log(
      `Error updating settings with dictionary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Helper to sync from custom dictionaries to global
async function syncCustomDictionariesToGlobal(
  folderPath: string
): Promise<number> {
  try {
    const settings = getFolderSettings(folderPath);
    if (!settings || !settings["cSpell.customDictionaries"]) {
      return 0;
    }

    const customDictionaries = settings["cSpell.customDictionaries"];
    if (typeof customDictionaries !== "object") {
      return 0;
    }

    log(`Syncing custom dictionaries from ${folderPath} to global dictionary`);
    let allDictionaryWords: string[] = [];

    // Process all dictionaries and collect words
    const dictionaryProcessingPromises = Object.entries(customDictionaries).map(
      async ([dictName, dictConfig]) => {
        const dict = dictConfig as any;
        if (!dict.path || typeof dict.path !== "string") {
          return [];
        }

        const dictPath = dict.path
          .replace(/\$\{workspaceFolder\}/g, folderPath)
          .replace(/\$\{workspace\}/g, folderPath);

        log(
          `Processing dictionary for sync to global: ${dictName} at ${dictPath}`
        );

        if (!fs.existsSync(dictPath)) {
          log(`Dictionary file not found: ${dictPath}`);
          return [];
        }

        return extractWordsFromDictionary(dictPath);
      }
    );

    // Wait for all dictionary processing to complete
    const dictWordArrays = await Promise.all(dictionaryProcessingPromises);

    // Flatten the array of arrays into a single array
    dictWordArrays.forEach((words) => {
      allDictionaryWords = [...allDictionaryWords, ...words];
    });

    // Add words to global dictionary
    return await addWordsToGlobalDictionary(allDictionaryWords);
  } catch (error) {
    log(
      `Error syncing custom dictionaries to global: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

// Helper to extract words from a dictionary file
function extractWordsFromDictionary(dictPath: string): string[] {
  try {
    const fileContent = fs.readFileSync(dictPath, "utf8");

    if (dictPath.endsWith(".txt")) {
      return fileContent
        .split(/[\n\r]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0 && !w.startsWith("#"));
    } else if (dictPath.endsWith(".json")) {
      const jsonData = JSON.parse(fileContent);
      if (Array.isArray(jsonData.words)) {
        return (jsonData as DictionaryJson).words.filter(
          (w: unknown): w is string => typeof w === "string"
        );
      } else if (Array.isArray(jsonData)) {
        return jsonData.filter((w) => typeof w === "string");
      }
    }

    return [];
  } catch (error) {
    log(
      `Error extracting words from dictionary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
}

// Function for command to sync custom dictionaries to global
async function syncCustomDictionariesToGlobalCommand(): Promise<void> {
  return showSyncOperation(
    "Syncing Custom Dictionaries to Global",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        log("No workspace folders found");
        return;
      }

      log(`Found ${workspaceFolders.length} workspace folder(s)`);
      let totalWordsAdded = 0;

      for (const folder of workspaceFolders) {
        const folderPath = folder.uri.fsPath;
        log(
          `Processing custom dictionaries in: ${folderPath} (${folder.name})`
        );

        const wordsAdded = await syncCustomDictionariesToGlobal(folderPath);

        if (wordsAdded > 0) {
          log(
            `Added ${wordsAdded} word(s) from custom dictionaries in ${folder.name} to global dictionary`
          );
          totalWordsAdded += wordsAdded;
        }
      }

      if (totalWordsAdded > 0) {
        log(
          `Total: Added ${totalWordsAdded} new word(s) from custom dictionaries to global cSpell dictionary`
        );
        showNotification(
          `Added ${totalWordsAdded} new word(s) from custom dictionaries to global cSpell dictionary`
        );
      } else {
        log("No new words added to global dictionary from custom dictionaries");
      }
    }
  );
}
