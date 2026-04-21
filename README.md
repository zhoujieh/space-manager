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

### V2.1.5 - Bug Fix: init 后索引为空导致误清理 (2026-04-21)
**根因修复**：
1. **runtime/main.js** - `initialize()` 末尾添加 `await this.index.rebuild()`，init 后立即扫描文件系统
2. **runtime/index.js** - `rebuild()` 生成文件时设置 `importance: 'high'` + `source: 'index'`，确保 metadata 可信

**问题描述**：v2.1.4 及之前版本，init 只创建空索引，cleanup 读取空索引后 rebuild，`importance=normal` + 无 source 字段 → metadata 不可信 → importance 降为 low → 软规则触发 → 误清理。

**已验证**：测试 workspace `~/.qclaw/workspace-agent-92f74409`，索引重建后所有文件 `importance=high`，软规则不再触发 ✅

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
