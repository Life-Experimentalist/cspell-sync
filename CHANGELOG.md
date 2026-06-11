# Change Log

All notable changes to the "cSpell Sync" extension will be documented in this file.

## [1.1.0] - 2026-06-12

### Changed
- Upgraded all devDependencies to latest stable: TypeScript 5.8, ESLint 9, typescript-eslint 8, esbuild 0.28, @vscode/vsce 3.9, Node 22 types
- Bumped `engines.vscode` from `^1.60.0` to `^1.85.0`
- Updated esbuild target from `node14` to `node20`
- Fixed esbuild watch mode to use native `esbuild.context().watch()` instead of fragile `fs.watch` loop
- Replaced legacy `.eslintrc.json` with ESLint 9 flat config (`eslint.config.mjs`)
- Fixed `lint` npm script (removed invalid `--ext ts` flag incompatible with ESLint 9)
- Updated TypeScript compiler target and lib from `ES2020` to `ES2022`
- Added `Linters` to extension categories

### Fixed
- Removed unused `WordProcessor` type alias in `extension.ts`
- Corrected bug tracker URL (was placeholder `yourusername`, now `Life-Experimentalist`)
- Added missing entries to `.vscodeignore`: `vsc-extension-quickstart.md`, `scripts/`, `.github/`, `eslint.config.mjs`, `docs/`

### Added
- `releases/` directory: VSIX and source zip artifacts versioned under `releases/{version}/`
- `scripts/package.js`: cross-platform script to build VSIX and source zip into `releases/{version}/`
- `.github/workflows/release.yml`: CI that validates version, builds artifacts, and publishes a GitHub Release automatically on `v*.*.*` tag push
- `ovsx` devDependency for Open VSX publishing (`npm run publish:ovsx`)
- `archiver` devDependency for cross-platform source zip creation
- New npm scripts: `package`, `publish:vsce`, `publish:ovsx`, `publish:all`

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
  - `Ctrl+Alt+S` (`Cmd+Alt+S` on Mac) — Sync project to global
  - `Ctrl+Alt+G` (`Cmd+Alt+G` on Mac) — Sync global to projects
- Status bar integration for easy access
- Alphabetical sorting of dictionaries for better organization
- Flexible configuration options
- Automatic startup synchronization
- Combined.txt file detection and processing
- Custom dictionary creation and management
- Project-specific settings
- Unit and integration tests
