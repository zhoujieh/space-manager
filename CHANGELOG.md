# Changelog

All notable changes to the Space Manager skill will be documented in this file.

## [2.1.5] - 2026-04-21

### Bug Fixes

#### Critical - init 后索引为空导致误清理
- **init 不扫描文件系统** - 初始化只创建目录和索引文件，不扫描实际文件，导致 `space_index.json` 为空 `{files:[]}`
- **索引为空时 cleanup 行为** - cleanup 读取空索引后调用 `index.rebuild()` 重新扫描，`importance=normal` 且无 `source` 字段
- **metadata 不可信 → importance 被降级** - `isMetadataTrusted()` 要求 `source === 'index'` 或 `source in ['system','hook','skill','tool']`，rebuild 生成的文件无 source 字段 → metadata 不可信 → importance 降为 'low'
- **软规则触发** - `importance=low` + `last_used > 7天` → 触发软规则，文件被移入 .trash/

**根因链路**：
```
init → 索引为空 → cleanup读取空索引 → rebuild扫描 → importance=normal(无source)
→ metadata不可信 → importance降为low → 软规则触发 → 误清理
```

**修复方案**：
- `runtime/main.js` - `initialize()` 末尾添加 `await this.index.rebuild()`
- `runtime/index.js` - `rebuild()` 生成文件时设置 `importance: 'high'` 和 `source: 'index'`

**影响场景**：所有新 workspace 首次执行 `init` 后，`cleanup` 会误清理所有非热文件（>7天未用）。已存在的 workspace 在索引损坏后重建时也会触发。

**已验证**：测试 workspace `~/.qclaw/workspace-agent-92f74409`，索引重建后所有文件 `importance=high`，软规则不再触发 ✅

## [2.1.4] - 2026-04-19


### Performance & Optimization Release

#### Performance - LLM Batch Processing & Caching
- **LLM Batch Processing** - 10 files from 10 LLM calls down to 1 batch call (90% reduction)
- **Enhanced Cache System** - LRU cache with content hash keys, 1000-entry limit, 24-hour TTL
- **Batch Cleanup Integration** - Cleanup now collects pending LLM files and processes in batches

#### Performance - Index Consistency Check Optimization
- **Symbolic Link Detection** - Using `lstatSync` for accurate symlink detection with target validation
- **Large Workspace Support** - Default scan limit of 10,000 files, configurable via `max_index_scan_files`
- **Set Data Structures** - O(1) lookup performance vs O(n) array scans

#### Enhancement - Reference Detection Regex Patterns
- **Multi-language Import Support** - ES6 dynamic `import()`, `require.resolve()`, Python `from...import`, C++ `#include`, CSS `@import`, Ruby `require_relative`
- **Multi-line Import Patterns** - Support for brace-wrapped imports and parenthesized imports
- **Configuration File Path References** - Detection of path references in JSON, YAML, XML configs
- **Precise Path Matching Algorithm** - Improved matching for relative paths, query strings, hashes, and extensionless imports

#### Test Coverage - Comprehensive Integration Suite
- **20+ Integration Tests** - Covering batch processing, cache performance, reference detection, symlink handling, and configuration validation
- **10+ Unit Tests** - Focused on enhanced reference detection patterns and path matching accuracy
- **Performance Benchmarks** - Tests for large workspace handling and cleanup throughput

#### Fixed
- **Cleanup Batch Integration** - Fixed issue where LLM decisions were not properly batched during cleanup runs
- **Symbolic Link Consistency** - Improved handling of broken symlinks in index consistency checks
- **Path Matching Edge Cases** - Fixed false positives/negatives in complex import patterns

#### Changed
- **skill.json Configuration** - Added `max_index_scan_files: 10000` configuration option
- **Performance Defaults** - Batch size default increased to 10 files for optimal LLM API efficiency
- **Reference Detection Algorithm** - Replaced simple substring matching with precise path resolution

#### Added
- **`llm_decide_batch` API** - New tool for bulk LLM decisions with detailed statistics
- **Path Matching Helper** - `isPathMatch` function for accurate reference resolution
- **Performance Metrics** - Batch processing statistics in LLM and cleanup results
- **Configuration Validation** - Tests for skill.json configuration defaults

#### Technical Details
- **Batch Size**: Configurable via `cleanup.batchSize` (default: 10)
- **Cache Key**: MD5 hash of path + size + type + content hash (first 200 chars)
- **Symbolic Link Handling**: Separate validation for symlink targets vs symlink metadata
- **Regex Patterns**: 15+ patterns covering 10+ programming languages and config formats

## [2.1.1] - 2026-04-19

### Security & Performance Fixes

#### Security - Memory File Protection Supplement
- **Protected Paths Extended** - Added `/.git`, `/memory`, `/.learnings` to protected paths
- **HEARTBEAT Keyword** - Added to exempt keywords list (was missing)
- **Test Coverage** - Added tests for memory/.learnings protected paths and HEARTBEAT.md exempt keyword

#### Fixed
- **LLM Confidence Threshold Inconsistency** - Unified threshold to 0.7 across skill.json, cleanup.js, and SKILL.md
- **Index Consistency Check Performance** - Added max scan limit (10,000 files), optimized symlink handling, improved statistics formulas
- **node_modules Protection Logic** - Fixed nested node_modules protection failures; now correctly protects all node_modules directories with package.json in any ancestor directory
- **File Reference Detection** - Enhanced regex patterns for ES6/CommonJS/Python/C++ imports; improved exact path matching to avoid false positives
- **Metadata Time Validation** - Relaxed overly strict validation (no longer requires `updated <= lastUsed`)
- **LLM Performance & Cost Control** - Implemented batch processing (10 files/batch) and LRU caching system; reduced API calls from N to N/10
- **Log Path Consistency** - Unified cleanup log path to `/system/cleanup_log.json` (was `/.trash/cleanup_log.json`)
- **File Restoration Path Recovery** - Fixed deep path restoration using URL-safe Base64 encoding; restored files now preserve original directory structure
- **Protected Path Prefix Matching** - Fixed `/coredata` incorrectly matching `/core` protection rule
- **Integration Test Coverage** - Added 20+ integration tests covering cleanup flow, file restoration, node_modules protection, reference detection, and safety boundaries

#### Changed
- **Configuration Defaults** - Updated `llm_decision_threshold` from 0.3 to 0.7 in skill.json
- **Performance Optimizations** - Index consistency check now uses Set for O(1) lookups instead of O(n) array scans
- **Cache System** - LRU cache with 1000-entry limit and 24-hour TTL for LLM decisions

#### Added
- **Batch Processing** - `llm.decideBatch()` method for efficient bulk decisions
- **Cache Statistics** - `llm.getCacheStats()` for monitoring cache performance
- **Performance Metrics** - Index consistency check now returns detailed timing statistics
- **Integration Test Suite** - `test/integration.test.js` with 8 comprehensive test cases

#### Technical Details
- **Base64 Encoding**: URL-safe Base64 (RFC 4648) for path encoding in trash filenames
- **Cache Key Generation**: Stable keys ignoring timestamp variations
- **Path Normalization**: Consistent handling of leading slashes across all file operations
- **Error Recovery**: Graceful fallbacks for index updates and file operations

## [2.1.0] - Initial Release

### Features
- Workspace initialization with directory structure
- File classification based on extension and content
- Smart cleanup with rule-based and LLM-based decisions
- Index management and consistency checking
- Trash system with atomic move operations
- LLM integration for borderline file decisions
