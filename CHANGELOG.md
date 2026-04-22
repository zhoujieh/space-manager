# Changelog

All notable changes to the Space Manager skill will be documented in this file.

## [2.3.0] - 2026-04-22

### 功能更新

**规则章节追加到顶部**：自检逻辑改为将规则章节追加到 AGENTS.md 顶部，已有时从原位置移除并重新插入到顶部

**完整规则内容嵌入 main.js**：referenceSection 替换为完整规则模板，不再依赖 SKILL.md 模板追加

**模板增加强制说明**：强制 Agent 按规则写入对应文件到对应文件夹
## [2.2.1] - 2026-04-22

### Bug Fixes

移除 *.traineddata 强规则，交给 LLM 判断（OCR语言包误清理问题）

## [2.2.0] - 2026-04-22

### Bug Fixes

本次修复解决模板追加到 AGENTS.md 后显示异常的问题。

#### 模板格式修复

**代码块语言标签**：SKILL.md 模板外层从 ``` 改为 ```template，避免渲染时与内层冲突

**嵌套代码块替换**：操作流程和处理流程中的嵌套 ``` 改为 `>` 行内格式，彻底消除显示异常

**版本同步**：skill.json / SKILL.md / README / CHANGELOG / _meta.json / workspace-rules.md

## [2.1.9] - 2026-04-22

### Documentation Fixes

**模板格式修复**
- **问题** - SKILL.md 中的规则模板使用了 ```markdown 包裹，导致 AGENTS.md 追加后显示异常
- **修复** - 改用 ``` 包裹模板内容

**软规则矛盾修复**
- **问题** - SKILL.md 模板中「0字节文件>7天→直接删除」与安全规则（禁止 rm）矛盾
- **修复** - 改为「0字节文件也必须移入 .trash/，禁止直接删除」

## [2.1.8] - 2026-04-22

### Bug Fixes

本次修复解决集成测试全部失败问题，测试通过率从90.5%提升到100%。

#### 测试修复

**文件恢复与索引更新测试（测试18）**
- **问题** - restoreFromTrash()恢复文件后索引未更新，路径格式不一致（无/开头）
- **影响** - 恢复的文件不在索引中，无法被引用检查
- **修复** - restoreFromTrash()中添加路径格式标准化，确保索引路径使用/开头

**符号链接处理测试（测试12）**
- **问题** - rebuild()方法中excludeDirs逻辑不完整，只跳过`.`开头和node_modules，未跳过system目录
- **影响** - space_index.json被扫描导致大小不匹配，checkConsistency()返回false
- **修复** - rebuild()方法添加完整excludeDirs列表

**索引一致性检查**
- **问题** - initialize()创建AGENTS.md后未添加到索引，导致missing_in_index错误
- **影响** - 新workspace初始化后一致性检查失败
- **修复** - 添加excludeFiles排除核心文件列表（AGENTS.md等），永不移动不需要索引

## [2.1.7] - 2026-04-21

### Bug Fixes

本次修复解决8个关键bug，引用检查核心功能恢复正常。

#### P0 关键修复

**contentMatch调用方式错误**
- **问题** - classifier.js L251，`contentMatch` 作为RegExp.test()调用，但它是函数而非正则对象
- **影响** - contentMatch规则失效，依赖匹配的分类可能错误
- **修复** - 修改为正确的函数调用方式 `contentMatch(content)`

**.yml文件分类错误**
- **问题** - .yml文件被分类到 `/core` 目录，但应原地保留
- **影响** - 配置文件被错误移动，破坏项目结构
- **修复** - classifier.js添加.yml/.yaml的分类规则，返回null（原地保留）

#### P1 性能/逻辑修复

**正则exec()状态污染导致死循环**
- **问题** - cleanup.js引用检查的正则表达式带有g标志，exec()会更新lastIndex导致状态污染
- **影响** - 可能导致部分匹配失败或性能问题
- **修复** - 移除g标志，改用match()查找所有匹配，再为每个匹配创建新正则提取分组

**isFileReferenced()性能优化**
- **问题** - scanExtensions仅包含.js/.ts等少数类型，C++/Python文件引用未检查
- **影响** - .cpp/.py/.c/.h等文件的引用关系未被识别，可能误清理
- **修复** - 扩展scanExtensions包含.c/.cpp/.h/.hpp/.java/.go/.rs/.py等

**ambiguousTypes列表不完整**
- **问题** - ambiguousTypes缺少.html/.svg/.config/.env等常见配置类型
- **影响** - 这些文件类型被当作普通文件处理，可能误清理
- **修复** - classifier.js扩展ambiguousTypes添加缺失类型

#### P2 配置修复

**文档路径不支持GitHub URL**
- **问题** - main.js文档路径使用本地路径，无法访问远程内容
- **影响** - 在无本地文档环境时无法获取文档内容
- **修复** - 支持GitHub raw URL作为回退路径

**skill.json配置未正确加载**
- **问题** - main.js构造函数未读取skill.json中的配置项
- **影响** - 配置项如max_index_scan_files未生效
- **修复** - 构造函数正确加载skill.json配置

### Code Improvements

**引用检查模式增强**
- Python导入模式支持未加引号的模块名和相对导入（`.utils`, `..lib`）
- C++ #include模式修复，支持"path"和<path>两种格式
- JSON配置模式支持带引号的键名和数组语法
- 正则匹配逻辑优化，避免exec()死循环

### Tests

**单元测试**: classifier.test.js 12/12通过(100%)，cleanup.test.js 12/12通过(100%)
**集成测试**: 14/21通过(66.7%)，核心引用检查功能已验证

### Files Modified

- `runtime/classifier.js` - contentMatch调用、.yml分类、ambiguousTypes扩展
- `runtime/cleanup.js` - 正则优化、引用模式修复、scanExtensions扩展
- `runtime/main.js` - 文档路径、配置加载
- `test/unit/` - 单元测试修复与新增

## [2.1.6] - 2026-04-21

### Bug Fixes

#### Critical - getAllFiles 缺失导致引用扫描失败
- **Index 类缺少 `getAllFiles()` 方法** - cleanup.js 调用 `this.manager.index.getAllFiles()` 获取所有文件做引用扫描，但 Index 类从未定义该方法
- **影响** - 每次引用扫描均报错 `this.manager.index.getAllFiles is not a function`，引用检查形同虚设，被引用的文件仍可能被清理
- **修复** - 在 Index 类中添加 `getAllFiles()` 方法，返回 `readIndex().files`

#### Critical - 旧索引自动重建
- **旧索引无 source 字段** - 早期版本生成的索引文件无 `source` 字段，`importance=normal`，导致 `isMetadataTrusted()` 返回 false → importance 被降级为 low → 软规则触发误清理
- **路径缺失 /core 前缀** - 旧索引中 `core/research/` 下的文件路径记录为 `/research/...`（少了 `/core`），保护路径 `/core/` 匹配不到
- **修复** - cleanup 启动时检测索引中是否存在无 source 字段的文件，如有则自动调用 `rebuild()` 重建索引
- **验证** - 模拟旧索引（5个文件，无 source，importance=normal）→ cleanup 自动重建为 110 个文件，0 个被误清理 ✅

**根因链路**：
```
旧索引无source字段 → isMetadataTrusted()=false → importance降为low
→ 软规则触发（low + >7天未用）→ 核心研究文件被误移入回收站
```

**同时修复**：`getAllFiles()` 缺失导致引用扫描全部失败（79条报错），重建后引用检查恢复正常 ✅

## [2.1.5] - 2026-04-21

### Features

#### Task Summary 文件分类
- **规则添加** - workspace-rules.md 新增 task-summary 文件分类规则（优先级1）
- **分类器支持** - classifier.js 添加 task-summary 文件识别逻辑，支持 `.task-summary` 隐藏文件
- **根目录隐藏文件豁免调整** - 根目录隐藏文件豁免规则排除 task-summary 文件，确保其正确分类到 `/temp/logs/`
- **影响**：所有 task-summary 文件（含以 `.` 开头的隐藏文件）自动分类到 `temp/logs/` 目录

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
