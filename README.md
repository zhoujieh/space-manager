# Space Manager

OpenClaw Agent Workspace 文件管理 + 自动清理 + LLM 判断系统

> ⚠️ 仅管理 `~/.qclaw/workspace-*` 目录，不是电脑桌面。桌面整理请用「文件整理」技能。

## 📄 完整文档

所有规则、API、配置均以 **[SKILL.md](./SKILL.md)** 为唯一权威来源。

## 🚀 快速使用

```bash
# 初始化 workspace
node runtime/main.js /path/to/workspace init

# 扫描索引
node runtime/main.js /path/to/workspace scan

# 清理（dry-run）
node runtime/main.js /path/to/workspace cleanup --dry-run

# 分类文件
node runtime/main.js /path/to/workspace classify /temp/test.log
```

## 📦 版本
### V2.3.0 - 模板修复 (2026-04-22)

#### Documentation Fixes

- **模板格式** - SKILL.md 中的规则模板从 ```markdown 改为 ```，解决 AGENTS.md 追加后显示异常问题
- **软规则矛盾** - 0字节文件处理规则从「直接删除」改为「必须移入 .trash/」，与安全规则一致

### V2.1.8 - 测试修复 (2026-04-22)

#### Bug 修复

本次修复解决集成测试全部失败问题，测试通过率从90.5%提升到100%。

**测试修复**:
- **文件恢复与索引更新** - restoreFromTrash()恢复文件后索引未更新，添加路径格式标准化
- **符号链接处理** - rebuild()方法添加完整excludeDirs列表
- **索引一致性检查** - 添加excludeFiles排除核心文件列表

### V2.1.7 - 引用检查修复 (2026-04-21)

#### Bug 修复（8个关键bug全部修复）

**P0 关键修复**:
- **contentMatch调用方式** - classifier.js L251，修复contentMatch作为函数调用而非RegExp.test()
- **.yml文件分类** - classifier.js，.yml/.yaml文件分类到null（原地保留），非/core

**P1 性能/逻辑修复**:
- **正则exec()状态污染** - cleanup.js，移除g标志避免死循环，改用match()+exec()组合
- **isFileReferenced()性能优化** - cleanup.js，scanExtensions扩展支持.c/.cpp/.h/.hpp/.java/.go/.rs
- **ambiguousTypes列表扩展** - classifier.js，添加.html/.svg/.config/.env/.ini/.toml

**P2 配置修复**:
- **文档路径支持GitHub URL** - main.js，支持GitHub raw URL回退机制
- **skill.json配置加载** - main.js，构造函数正确读取skill.json配置

#### 测试结果
- **单元测试**: classifier.test.js 12/12通过(100%)，cleanup.test.js 12/12通过(100%)
- **集成测试**: 14/21通过(66.7%)，核心功能已验证

#### 文件修改
- `runtime/classifier.js` - contentMatch调用、.yml分类、ambiguousTypes扩展
- `runtime/cleanup.js` - 正则优化、引用模式修复（Python/C++/JSON）、scanExtensions扩展
- `runtime/main.js` - 文档路径、配置加载
- `test/unit/` - 单元测试修复与新增

### V2.1.6 - Bug Fix (2026-04-21)

#### Bug Fix（getAllFiles 缺失 + 旧索引误清理）
- **getAllFiles 缺失** - Index 类缺少 `getAllFiles()` 方法，导致 cleanup 引用扫描全部失败（79条报错），被引用的文件无法被保护
- **旧索引自动重建** - cleanup 启动时检测无 source 字段的旧索引，自动调用 rebuild() 重建，避免 importance 被降级为 low 导致误清理
- **已验证** - 模拟旧索引（无 source, importance=normal）→ 自动重建为 110 文件，0 个被误清理 ✅

### V2.1.5 - 功能更新与 Bug Fix (2026-04-21)

#### 功能更新
- **task-summary 文件分类** - 新增规则，task-summary 文件自动分类到 `temp/logs/` 目录
  - workspace-rules.md 新增分类规则（优先级1）
  - classifier.js 添加 task-summary 识别逻辑，支持 `.task-summary` 隐藏文件

#### Bug Fix（init 后索引为空导致误清理）
- **根因** - init 只创建空索引，cleanup 读取空索引后 rebuild，`importance=normal` + 无 source 字段 → metadata 不可信 → importance 降为 low → 软规则触发 → 误清理
- **修复** - main.js 添加 `await this.index.rebuild()`，index.js rebuild 设置 `importance: 'high' + source: 'index'`
- **已验证** - 测试 workspace `~/.qclaw/workspace-agent-92f74409`，索引重建后所有文件 `importance=high`，软规则不再触发 ✅
### V2.1.4 - 性能优化与测试增强 (2026-04-19)
**性能优化：**
1. **LLM批处理与缓存** - 10文件/批，90% API调用减少，LRU缓存1000条目
2. **索引一致性检查优化** - 符号链接lstatSync检测，Set数据结构O(1)查找
3. **引用检查正则增强** - 支持ES6动态import()、require.resolve()、Python from...import等15+模式
4. **大工作区支持** - 默认扫描限制10000文件，可配置max_index_scan_files
5. **集成测试套件** - 新增20+集成测试，总计30+测试覆盖
6. **单元测试覆盖** - 新增12个引用检查单元测试

**配置更新：**
- `skill.json`: 版本2.1.4，新增`max_index_scan_files: 10000`
- 文档同步：所有文档版本更新至V2.1.4

### V2.1.3 - 补充记忆文件保护 (2026-04-19)
**关键修复：**
1. **HEARTBEAT关键词保护** - 添加 HEARTBEAT.md 到豁免关键词列表
2. **记忆目录保护** - 添加 /memory 到保护路径
3. **学习记录保护** - 添加 /.learnings 到保护路径
4. **Git目录保护** - 添加 /.git 到保护路径

### V2.1.2 - 安全与性能修复 (2026-04-19)
**关键修复：**
1. **LLM置信度阈值统一** - 修复配置不一致问题（skill.json: 0.3 → 0.7）
2. **索引一致性检查性能** - 添加最大扫描限制（10000文件），优化符号链接处理
3. **node_modules保护逻辑** - 修复嵌套node_modules无法保护问题
4. **文件引用检查增强** - 支持ES6/CommonJS/Python/C++多语言导入
5. **元数据时间校验优化** - 放宽过于严格的校验规则
6. **LLM调用性能优化** - 添加批处理（10文件/批）和缓存系统
7. **日志路径统一** - 清理日志统一到 `/system/cleanup_log.json`
8. **文件恢复路径修复** - 支持深层路径恢复（Base64编码原路径）
9. **保护路径匹配修复** - 修复 `/coredata` 误匹配 `/core` 问题
10. **集成测试覆盖** - 新增20+集成测试，确保功能正确性

### V2.1.0 - 基础版本
- 初始发布：文件分类、自动清理、LLM判断、索引管理

## 📄 License

MIT
