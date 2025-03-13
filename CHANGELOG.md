# Change Log

All notable changes to the "cSpell Sync" extension will be documented in this file.

## [1.0.0] - 2025-03-14

### Added
- Initial release of cSpell Sync extension
- Bidirectional sync between project dictionaries and global dictionary
- Support for multiple sync sources:
  - Project settings (`cSpell.words`)
  - Custom dictionaries
  - Language-specific settings
  - Combined.txt files (temporary word lists)
- Support for multiple sync targets:
  - Global dictionary (`cSpell.userWords`)
  - Project settings
  - Workspace settings
  - New or existing custom dictionaries
- Commands:
  - `cspell-sync.syncWords`: Sync from projects to global dictionary
  - `cspell-sync.syncWordsToProject`: Sync from global to projects
  - `cspell-sync.syncCustomToGlobal`: Sync from custom dictionaries to global
- Keyboard shortcuts:
  - `Ctrl+Alt+S` (`Cmd+Alt+S` on Mac) - Sync project to global
  - `Ctrl+Alt+G` (`Cmd+Alt+G` on Mac) - Sync global to projects
- Status bar integration for easy access
- Alphabetical sorting of dictionaries for better organization
- Flexible configuration options
- Automatic startup synchronization
- Combined.txt file detection and processing
- Custom dictionary creation and management
- Project-specific settings
- Unit and integration tests

### Technical Details
- Efficient caching for better performance
- Debounced file change handling
- Error handling and logging
- Comprehensive user notifications

## [0.1.0] - Initial Release

### Features
- Automatic syncing of cSpell.words from project settings to global dictionary
- Support for combined.txt file detection and processing
- Configuration options for controlling sync behavior
- Status bar indicator for sync operations