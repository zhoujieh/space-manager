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
