# Changelog

All notable changes to the Space Manager skill will be documented in this file.

## [2.1.1] - 2026-04-19

### Security & Performance Fixes

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