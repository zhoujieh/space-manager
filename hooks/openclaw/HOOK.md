---
name: space-manager-init
description: "Injects space-manager rules reference into AGENTS.md during agent bootstrap"
metadata: {"openclaw":{"emoji":"📁","events":["agent:bootstrap"]}}
---

# Space Manager Init Hook

在 agent bootstrap 时检查 AGENTS.md 是否包含 space-manager 规则引用，如果没有则自动追加。

## 功能

- 监听 `agent:bootstrap` 事件
- 检查 AGENTS.md 是否包含 `## 📁 Space Manager` 章节
- 如果没有，追加规则引用到文件末尾
- 不覆盖已有内容，只追加缺失的规则

## 配置

无需配置，启用后自动生效。

```bash
openclaw hooks enable space-manager-init
```
