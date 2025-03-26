# cSpell Sync Extension for VS Code

Seamlessly synchronize cSpell dictionaries between projects, workspace, and your global settings. This extension ensures that your custom words, dictionaries, and spelling preferences remain consistent across all your projects.

## Features

- **Automatic Project to Global Sync**: Automatically synchronizes project-specific spelling dictionaries with your global VS Code dictionary.
- **Bidirectional Sync**: Sync words from global dictionary back to project settings, allowing centralized word management.
- **Custom Dictionary Management**: Create, update, and synchronize custom dictionaries.
- **Flexible Configuration**: Control exactly which sources to sync and how sync operations should behave.
- **Multiple Sync Sources**:
  - Project settings (`cSpell.words`)
  - Custom dictionaries
  - Language-specific settings
  - Combined.txt files (temporary word lists)
- **Multiple Sync Targets**:
  - Global dictionary (`cSpell.userWords`)
  - Project settings
  - Workspace settings
  - New or existing custom dictionaries

## Commands

The extension provides the following commands that you can execute through:
- The VS Code Command Palette (press `F1` or `Ctrl+Shift+P` and type "cSpell Sync")
- Keyboard shortcuts
- The extension's status bar item ($(sync) icon in the bottom status bar)

- **cSpell Sync: Sync Words from Projects to Global Dictionary** (`Ctrl+Alt+S` / `Cmd+Alt+S`)
  - Syncs words from all configured project sources to global dictionary
  - Runs automatically on startup (if enabled in settings)
  - Can also be triggered manually when needed

- **cSpell Sync: Sync Words from Global Dictionary to Projects** (`Ctrl+Alt+G` / `Cmd+Alt+G`)
  - Syncs words from global dictionary to configured project targets
  - Can be set to run automatically when global dictionary changes (see `bidirectionalSyncMode` setting)

- **cSpell Sync: Sync Words from Custom Dictionaries to Global Dictionary** 
  - Specifically syncs words from custom dictionaries to global dictionary
  - Available through Command Palette only (no default keyboard shortcut)

## Configuration Options

### General Settings

- `cspell-sync.autoSyncOnStartup`: Automatically sync when VS Code starts (default: `true`)
- `cspell-sync.initialSyncDelay`: Delay in milliseconds before running initial sync (default: `5000`)
- `cspell-sync.logToOutputChannel`: Log detailed operations to output channel (default: `false`)
- `cspell-sync.showNotifications`: Show notifications when words are synced (default: `true`)

### Source Settings (Project to Global)

- `cspell-sync.syncProjectSettings`: Sync from project settings.json (default: `true`)
- `cspell-sync.syncCombinedTxt`: Sync from combined.txt files (default: `true`)
- `cspell-sync.syncCustomDictionaries`: Sync from custom dictionaries (default: `true`)
- `cspell-sync.syncLanguageSettings`: Sync from language-specific settings (default: `true`)
- `cspell-sync.combinedFileWaitTime`: Time to wait before checking combined.txt file (default: `1000`)
- `cspell-sync.customToGlobalSync`: Sync words from custom dictionaries to global when running project-to-global sync (default: `false`)

### Target Settings (Global to Project)

- `cspell-sync.enableBidirectionalSync`: Enable syncing from global to project (default: `true`)
- `cspell-sync.bidirectionalSyncMode`: How to sync words from global to project (default: `shortcut`)
  - `shortcut`: Only via keyboard shortcut
  - `automatic`: Also sync when global dictionary changes
  - `disabled`: Turn off bidirectional syncing

### Sync Target Options

- `cspell-sync.projectLevelSync`: Settings for syncing to project level settings
  - `enabled`: Enable syncing to project level settings (default: `true`)
  - `target`: Which setting to sync to (`cSpell.words`, `cSpell.userWords`, or `cSpell.ignoreWords`)

- `cspell-sync.customDictionarySync`: Settings for syncing to existing custom dictionaries
  - `enabled`: Enable syncing to a custom dictionary file (default: `false`)
  - `dictionaryName`: Dictionary name to sync to (must exist in cSpell.customDictionaries)

- `cspell-sync.workspaceSync`: Settings for syncing to workspace-level settings
  - `enabled`: Enable syncing to workspace settings (default: `false`)
  - `target`: Which workspace setting to sync to (default: `cSpell.words`)

- `cspell-sync.newDictionarySync`: Settings for creating and syncing to a new dictionary
  - `enabled`: Enable creating/syncing to a new dictionary file (default: `false`)
  - `name`: Name for the new dictionary (default: `project-dictionary`)
  - `format`: Format for the dictionary file (`txt` or `json`, default: `json`)

## Working with Combined.txt

The extension can detect a special file called `combined.txt` which can be used as a temporary collection of words. This is useful for:

1. Quickly adding multiple words without editing settings
2. Sharing words with team members
3. Importing words from external sources

When a `combined.txt` file is detected, the extension will:
1. Extract all words from the file
2. Add any new words to your global dictionary
3. Remove the file (unless configured to keep it)

You can disable the auto-remove behavior by configuring the project setting:
```json
{
  "cspell-sync.combined-auto-remove": false
}
```

## Example Workflows

### Basic Usage

1. Open a project with custom spelling words in `.vscode/settings.json`
2. Let cSpell Sync automatically add these words to your global dictionary
3. Words will now be recognized in all your projects

### Advanced Dictionary Management

1. Configure `newDictionarySync` to create a project-specific dictionary
2. Use `Ctrl+Alt+G` to sync your global words to this dictionary
3. The dictionary will be automatically registered in your project settings

### Team Dictionary Sharing

1. Configure `customDictionarySync` to target a shared dictionary
2. Add words to your global dictionary normally
3. Use `Ctrl+Alt+G` to sync these words to the shared dictionary
4. Commit the updated dictionary file to share with your team

## For More Information

- Check the [GitHub repository](https://github.com/Life-Experimentalist/cspell-sync) for source code and updates
- Report issues or suggest features in the [issue tracker](https://github.com/yourusername/cspell-sync/issues)
- Read the [CHANGELOG.md](CHANGELOG.md) file for version history and changes

