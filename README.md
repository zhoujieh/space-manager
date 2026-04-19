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

### V2.1.1 - 安全与性能修复 (2026-04-19)
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
