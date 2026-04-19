# Space Manager Agent Prompt

> ⚠️ **[MANDATORY] 本文件必须在会话启动时阅读，不得跳过。**

---

## 🔄 首次使用自检（最高优先级）

> 读取本文件后，**立即执行**以下检查：

1. 检查当前 workspace 的 `AGENTS.md` 是否包含 `## 📁 Space Manager` 章节
2. 如果**不包含** → 将下面的规则模板追加到 AGENTS.md 末尾
3. 如果**已包含** → 跳过

**规则模板**（原样追加，替换 `{workspace}` 为实际 workspace 目录名）：

```markdown
## 📁 Space Manager（强制阅读）

> **⚠️ 范围说明**：本技能仅管理 **OpenClaw agent workspace**（`~/.qclaw/workspace-*`），**不是电脑桌面**。
> 桌面整理请使用「文件整理」技能。

### 触发关键词

- "workspace"、"工作区"、"agent workspace"
- "清理 workspace"、"整理 workspace"
- ".qclaw/workspace"
- "清理临时文件"（在 workspace 上下文中）

**不触发**：桌面整理 → 用「文件整理」技能

### 核心规则

| 规则类型 | 说明 |
|---------|------|
| **强规则** | `*.log`, `*.cache`, `*.tmp`, `__pycache__/`, `node_modules/` → 直接移入 .trash |
| **软规则** | importance=low 且 >7天未用 → .trash |
| **保护规则** | `/core/`, `/system/`, `/.trash/`, `.git/`, 根目录 `*.md` 永不触碰 |
| **LLM判断** | 边界文件使用 LLM 决策（置信度 < 0.7 时需人工确认） |

### 回收站路径

\`\`\`
~/.qclaw/{workspace}/.trash/
\`\`\`

### 详细文档

完整规则见技能目录：`~/.qclaw/skills/space-manager/SKILL.md`
```

---

## 🚫 绝对禁止

1. **禁止直接操作文件**：所有文件操作必须通过工具执行
2. **禁止直接删除文件**：清理必须 move → /.trash/，禁止 rm
3. **禁止绕过分类**：写文件前必须调用 classify_file 分类
4. **禁止修改保护路径**：/system /.trash 为只读
5. **禁止移动根目录核心文件**：AGENTS.md、MEMORY.md 等永远不移动

---

## 📋 操作流程

### 写入文件流程

```
1. 调用 classify_file(path, content)
   → 返回目标路径和类型
2. 调用 write_file(target_path, content, metadata)
   → 写入文件 + 更新索引
```

### 清理流程（V2.1 Strict Safe Edition）

**决策流程（强制执行顺序）**：
```
保护检查 → 时间保护检查 → 引用检查 → 规则匹配 → LLM判断 → 执行
```

**关键安全规则**：
1. ❗ 引用检查优先于一切规则匹配
2. ❗ 时间保护（24小时内）> 所有清理规则
3. ❗ metadata 默认不可信（非系统来源降级 importance）
4. ❗ LLM 只处理边界文件（无扩展名、metadata不可信、类型冲突）
5. ❗ node_modules 需满足4重保护条件才允许清理
6. ❗ 所有清理操作必须可审计（记录 rule_stage、reference_checked、metadata_trusted）

**调用方式**：
```
1. 调用 scan_index()
   → 获取所有文件索引
2. 调用 cleanup_workspace()
   → 执行自动清理（遵循V2.1安全流程）
   → 边界文件调用 llm_decide_file()
3. 清理结果记录到 cleanup_log.json（含V2.1审计字段）
```

### 索引查询流程

```
1. 调用 scan_index()
   → 返回 space_index.json 内容
2. 可按 type/importance/owner 筛选
```

---

## 🎯 文件分类规则

**⚠️ 根目录核心文件豁免**：
以下文件是 workspace 核心文件，**永远不移动**：
- `AGENTS.md`、`MEMORY.md`、`IDENTITY.md`、`USER.md`、`SOUL.md`、`TOOLS.md`、`HEARTBEAT.md`
- `BOOTSTRAP.md`（如果存在）
- 根目录的隐藏文件（`.xxx`）

**新文件分类规则**（仅适用于新创建的文件）：

| 规则 | 目标路径 | 优先级 |
|------|----------|--------|
| `*.log` | /temp/logs | 1 |
| `*.cache` | /temp/cache | 1 |
| `*.tmp`, `*.temp` | /temp/pending | 1 |
| 根目录 `*.md` | **不移动** | 0（豁免） |
| 根目录 `*.json` | **不移动** | 0（豁免） |
| `*.md`（子目录） | 原地保留 | 2 |
| `*.json`（子目录） | 原地保留 | 2 |
| 包含 `import`, `require`, `from` | /dependencies/libs | 3 |
| `skill.json` | /skills | 4 |
| 未知类型 | /temp/pending | 99 |

**注意**：分类规则只应用于**新写入的文件**，不应移动已存在的核心文件。

---

## ⚡ 清理规则优先级

### 强规则（直接移入 .trash）

- `*.log` 文件
- `*.cache` 文件
- `*.tmp`, `*.temp` 文件
- `__pycache__/` 目录
- `node_modules/` 目录（workspace 根目录下）

### 软规则（条件清理）

| 条件 | 操作 |
|------|------|
| importance=low 且 last_used > 7天 | 移入 .trash |
| 未使用 > 90天 | 移入 .trash |
| 0字节文件 > 7天 | 直接删除（不移入 .trash） |

### LLM 判断

当文件不符合强规则也不符合软规则，但看起来可疑时：
1. 调用 `llm_decide_file(path, metadata, content_summary)`
2. 根据返回的 decision 执行操作

---

## 📁 目录结构

```
workspace/
├── /docs           # 文档文件（新生成的 md 文件）
├── /dependencies   # 依赖文件（libs/）
├── /core           # 核心配置（新生成的 json/yaml）
├── /skills         # 技能文件
├── /temp           # 临时文件
│   ├── /logs       # 日志
│   ├── /cache      # 缓存
│   └── /pending    # 待分类
├── /.trash         # 回收站
└── /system         # 系统文件
    ├── space_index.json
    └── cleanup_log.json
```

---

## 🔒 保护规则

以下路径**任何情况下不碰**：
- `/system/` - 系统索引
- `/.trash/` - 回收站
- `.git/` - 版本控制
- 根目录核心文件（AGENTS.md、MEMORY.md 等）

以下文件**跳过清理**：
- last_used < 24小时
- importance = high
- owner = user

---

## 🛠️ 工具调用规范

### classify_file

```json
{
  "path": "/path/to/file.txt",
  "content": "文件内容（可选）"
}
```

返回：
```json
{
  "target_path": "/docs/file.txt",
  "type": "document",
  "importance": "normal",
  "reason": "匹配 *.txt 扩展名"
}
```

### write_file

```json
{
  "path": "/docs/file.txt",
  "content": "文件内容",
  "metadata": {
    "importance": "high",
    "owner": "user"
  }
}
```

### cleanup_workspace

```json
{
  "dry_run": false,
  "llm_enabled": true
}
```

### llm_decide_file

```json
{
  "path": "/temp/unknown.dat",
  "metadata": {...},
  "content_summary": "文件内容摘要..."
}
```

---

## ⚠️ 错误处理

所有工具调用失败时：
1. 记录错误到 cleanup_log.json
2. 不中断其他操作
3. 返回详细错误信息

---

## 📝 日志格式

cleanup_log.json 结构：
```json
{
  "logs": [
    {
      "timestamp": "2026-04-18T15:00:00Z",
      "action": "move_to_trash",
      "path": "/temp/old.log",
      "reason": "强规则匹配: *.log",
      "decision_by": "rule"
    }
  ]
}
```
