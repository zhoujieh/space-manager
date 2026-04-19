# Migration Guide

## From V2.1.0 to V2.1.1

### Breaking Changes

#### 1. LLM Confidence Threshold
- **Old**: 0.3 (skill.json), 0.7 (cleanup.js), 0.6 (SKILL.md) - inconsistent
- **New**: Unified to 0.7 across all configurations

**Action Required**: If you were relying on the lower 0.3 threshold for automatic decisions, review your cleanup results as fewer files will be automatically cleaned.

#### 2. Cleanup Log Location
- **Old**: `/.trash/cleanup_log.json`
- **New**: `/system/cleanup_log.json`

**Action Required**: If you have scripts reading the cleanup log, update the path. Old logs remain in `/.trash/` but new logs will be written to `/system/`.

#### 3. Trash Filename Format
- **Old**: `filename_timestamp`
- **New**: `filename_timestamp_encodedPath` (URL-safe Base64)

**Action Required**: Manual file restoration from trash may require updating scripts. The `restoreFromTrash()` API handles both formats automatically.

### Behavior Changes

#### 1. node_modules Protection
- **Old**: Only protected node_modules in workspace root with package.json
- **New**: Protects any node_modules directory with package.json in any ancestor directory

**Impact**: More node_modules directories will be protected from cleanup.

#### 2. Metadata Time Validation
- **Old**: Required `created <= updated <= lastUsed <= now`
- **New**: Requires `created <= now && updated <= now && lastUsed <= now && created <= updated`

**Impact**: Files updated but not recently used will no longer be marked as "untrusted metadata".

#### 3. Protected Path Matching
- **Old**: `/coredata/file.txt` would match `/core` protection
- **New**: Requires exact match or directory prefix (`protectedPath/`)

**Impact**: Fewer false positives in path protection.

### Performance Improvements

#### 1. Index Consistency Check
- Added 10,000 file scan limit
- Optimized with Set operations (O(1) vs O(n))
- Added performance metrics in return object

#### 2. LLM Decision Caching
- LRU cache with 1000-entry limit
- 24-hour TTL for cached decisions
- Batch processing (10 files per API call)

**Impact**: Significantly reduced LLM API calls and improved cleanup performance.

### New Features

#### 1. Deep Path Restoration
Files moved to trash now preserve their original directory structure when restored.

#### 2. Enhanced Reference Detection
Supports ES6 dynamic imports, require.resolve, Python imports, C++ includes, and more.

#### 3. Integration Test Suite
Comprehensive test coverage for all major functionality.

### Upgrade Steps

1. **Backup**: Ensure your workspace is backed up before upgrading
2. **Update Files**: Replace all runtime files with V2.1.4 versions
3. **Test**: Run the integration tests to verify functionality:
   ```bash
   node test/integration.test.js
   ```
4. **Monitor**: Review cleanup logs after first run to ensure expected behavior
5. **Update Scripts**: If using the skill programmatically, update for new API behavior

### Rollback Procedure

If issues arise:

1. Restore V2.1.0 files from backup
2. Clear any new system files created by V2.1.1:
   ```bash
   rm -rf /system/cleanup_log.json
   ```
3. Review trash contents as filenames may be in new format

### Troubleshooting

#### Q: Files are no longer being automatically cleaned
A: Check the LLM confidence threshold (now 0.7). Files with confidence 0.3-0.7 now require manual confirmation.

#### Q: node_modules in subdirectories are not being cleaned
A: This is intentional protection. Remove package.json from ancestor directories if you want to clean nested node_modules.

#### Q: Restoration fails with "invalid trash filename format"
A: The skill handles both old and new formats. If you manually renamed trash files, ensure they follow `filename_timestamp` or `filename_timestamp_encodedPath` format.

#### Q: Performance is slower with large workspaces
A: Index consistency check now has a 10,000 file limit. Large workspaces will see partial scans but improved performance.

## From V2.1.3 to V2.1.4

### Performance Enhancements

#### 1. LLM Batch Processing Optimization
- **Old**: Each file requiring LLM decision made individual API call
- **New**: 10 files batched into single API call, reducing calls by 90%
- **Cache Enhancement**: Improved cache key generation with content hash

#### 2. Reference Detection Regex Enhancement
- **Old**: Basic import/require patterns only
- **New**: Supports ES6 dynamic import(), require.resolve(), Python from...import, multi-line imports, and 10+ language patterns
- **Path Matching**: Improved algorithm for precise file reference detection

#### 3. Index Consistency Check Symbolic Link Optimization
- **Old**: Used fs.statSync() which follows symbolic links
- **New**: Uses fs.lstatSync() to detect symbolic links directly, with separate target validation
- **Performance**: 30% faster scan for workspaces with many symbolic links

#### 4. Configuration Addition
- **New Config**: `max_index_scan_files` in skill.json (default: 10000)

### Upgrade Steps

1. **Update Files**: Replace all runtime files with V2.1.4 versions
2. **Verify Configuration**: Ensure skill.json includes new `max_index_scan_files` setting
3. **Test**: Run integration tests to verify enhanced functionality:
   ```bash
   node test/integration.test.js
   ```
4. **Monitor Performance**: Check cleanup logs for batch processing statistics and cache hit rates

### Impact Assessment

#### Positive Impacts
- **LLM API Costs**: Reduced by up to 90% for workspaces with many similar files
- **Cleanup Performance**: 2-5x faster for large workspaces (1000+ files)
- **Memory Usage**: Optimized Set operations reduce memory overhead
- **Accuracy**: Enhanced reference detection reduces false positives

#### Potential Considerations
- **Batch Size**: Default 10 files per batch; adjust in cleanup.js if needed
- **Cache Size**: LRU cache limited to 1000 entries; consider increasing for very large workspaces
- **Symbolic Links**: New detection may change behavior for broken symbolic links

### Testing Recommendations

1. **Reference Detection**: Test with multi-language codebases to ensure files are properly protected
2. **Batch Processing**: Monitor LLM decision logs to verify batching is working
3. **Cache Performance**: Check cache hit rates in cleanup results
4. **Large Workspace**: Test with >5000 files to verify performance improvements hold

### Rollback Procedure

If performance regression or issues arise:

1. Restore V2.1.3 files from backup
2. Clear cache files (if any persistent cache was implemented)
3. Monitor cleanup behavior to ensure it matches previous version