# Space Manager V2.1.5

**OpenClaw Agent Workspace** 文件管理 + 自动清理 + LLM 判断系统

## 🔄 首次使用自检（读取本文件后立即执行）

> 检查当前 workspace 的 `AGENTS.md` 是否包含 `## 📂 Space Manager` 章节。
> - **不包含** → 将以下规则模板追加到 AGENTS.md 末尾（替换 `{workspace}` 为实际目录名）
> - **已包含** → 跳过

规则模板：
```markdown
## 📁 Space Manager 文件管理（强制阅读）

> ⚠️ **[MANDATORY] 本节内容必须在会话启动时阅读，不得跳过。**
> 权威文档：`docs/workspace-rules.md` (V2.1.5) | `SKILL.md` (V2.1.5)

### 🚫 绝对禁止
1. **禁止直接操作文件**：所有文件操作必须通过工具执行
2. **禁止直接删除文件**：清理必须 move → /.trash/，禁止 rm
3. **禁止绕过分类**：写文件前必须调用 classify_file 分类
4. **禁止修改保护路径**：/core /system /.trash 为只读

### 📋 操作流程
**写入文件流程**：
```
1. classify_file(path, content) → 返回目标路径和类型
2. write_file(target_path, content, metadata) → 写入 + 更新索引
```

**清理流程**：
```
1. scan_index() → 获取索引
2. cleanup_workspace() → 执行清理（不确定文件调用 llm_decide_file）
```

### 🎯 文件分类规则
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
| `*.md`（子目录） | /docs | 2 |
| `*.json`（子目录） | 原地保留 | 2 |
| 包含 `import`, `require`, `from` | /dependencies/libs | 3 |
| `skill.json` | /skills | 4 |
| 未知类型 | /temp/pending | 99 |

### ⚡ 清理规则
**强规则（直接移入 .trash）**：
- `*.log`, `*.cache`, `*.tmp`, `*.temp`
- `__pycache__/`, `node_modules/`（workspace 根目录）

**软规则（条件清理）**：
- importance=low 且 last_used > 7天 → .trash
- 未使用 > 90天 → .trash
- 0字节文件 > 7天 → 直接删除

### 🔒 保护规则
**永不触碰**：
- `/system/`, `/.trash/`, `.git/`
- 根目录核心文件（AGENTS.md、MEMORY.md、IDENTITY.md、USER.md、SOUL.md、TOOLS.md、HEARTBEAT.md）

**跳过清理**：
- last_used < 24小时
- importance = high
- owner = user

### 📝 Task-Artifact 文件处理
**系统强制要求**：每次实质性工作后必须写入 `task-*.md` 文件。

**处理流程**：
```
1. 完成实质性工作 → 写入 task-summary_YYYY-MM-DD_HHMM.md
2. 写完后 → 立即移入 .trash/（不堆积）
3. memory/YYYY-MM-DD.md → 持久化记录（不需要 task 文件）
```

**为什么可以立即移入 .trash/**：
- task 文件与 memory 日志功能重复
- memory 日志是按天归档的持久化记录
- task 文件使命在写入时即结束

**禁止行为**：
- ❌ 写完 task 文件后留在根目录
- ❌ 不写 task 文件（违反系统要求）
- ❌ 在 cron isolated session 内写 task 文件
```

---

## 一、触发关键词

当用户消息包含以下关键词时触发：
- "workspace"、"工作区"、"agent workspace"
- "清理 workspace"、"整理 workspace"
- ".qclaw/workspace"
- "agent 文件管理"
- "清理临时文件"（在 workspace 上下文中）

**不触发场景**：
- "桌面整理"、"整理桌面" → 使用「文件整理」技能
- "整理文件"、"整理文件夹" → 使用「文件整理」技能

---

## 二、十大安全铁律（最高优先级）

### 1. 删除安全
- ✅ 所有清理**必须**移入 `/.trash/`，**禁止直接删除**
- ✅ 0字节文件超过7天也**必须**移入 `.trash/`，**不允许直接删除**
- ✅ 清理前**必须**检查文件是否被引用（import/require/链接）

### 2. 目录保护
- ✅ 以下路径**永不触碰**：`/core/`、`/system/`、`/.trash/`、`.git/`、`/skills/`、`memory/`、`.learnings/`
- ✅ 根目录核心文件**永不移动**：AGENTS.md、MEMORY.md、IDENTITY.md、USER.md、SOUL.md、TOOLS.md、HEARTBEAT.md
- ✅ 根目录隐藏文件**永不移动**：以 `.` 开头的文件

### 3. 时间保护
- ✅ `last_used < 24小时` 的文件**跳过清理**
- ✅ `importance = high` 的文件**跳过清理**
- ✅ `owner = user` 的文件**需额外确认**（区别于agent文件）

### 4. 最小信任原则
- ✅ 未识别文件 → 标记为 `importance: low`，触发 LLM 判断
- ✅ 未索引文件 → 不信任，需要重新扫描
- ✅ metadata 缺失 → **自动降级**为 `importance: low`

### 5. 防绕过机制
- ✅ **禁止**通过修改扩展名规避规则（如 `old.log` → `old.txt`）
- ✅ **禁止**通过写入 `/docs` 规避清理（.md文件如非task-*仍受保护）
- ✅ **禁止**通过构造伪 metadata 规避检查（需验证文件实际内容）

### 6. 决策收敛
所有清理决策**必须**按以下顺序收敛：
```
规则匹配 → 状态检查 → 引用检查 → LLM判断 → 行动
```
- 规则匹配失败 → 状态检查（hot/protected）
- 状态检查通过 → 引用检查（是否被依赖）
- 引用检查通过 → LLM判断（边界文件）
- LLM判断完成 → 执行行动（move_to_trash）
- **禁止**任何分支绕过上述流程

### 7. 日志完整性
- ✅ 所有动作**必须**记录日志：`cleanup_log.json`
- ✅ 日志**必须**包含：`timestamp`、`path`、`action`、`reason`、`decision_by`
- ✅ decision_by 枚举：`rule`（规则强制）、`llm`（LLM判断）、`user`（人工确认）

### 8. 索引一致性
- ✅ 每次文件操作**必须**同步更新 `space_index.json`
- ✅ `last_used_at` **必须**在每次读取时更新
- ✅ 索引重建**必须**对比实际文件系统，标记失真文件

### 9. LLM 判断规范
- ✅ 边界文件使用 LLM 决策，返回结构：
  ```json
  {
    "decision": "keep|trash|unsure",
    "reason": "判断原因",
    "confidence": 0.0-1.0,
    "suggested_importance": "high|normal|low"
  }
  ```
- ✅ `confidence < 0.7` → 建议人工确认
- ✅ `confidence >= 0.7` → 可自动执行
- ✅ **禁止**LLM直接删除大文件（>1MB），必须先下载分析

#### 批处理和缓存（V2.1.4新增）
- **批处理优化**：10个文件从10次LLM调用降至1次批量调用
- **缓存系统**：
  - 基于文件路径、大小、内容哈希的MD5缓存键
  - LRU缓存，最大1000个条目，24小时过期
  - 缓存命中时直接返回历史决策，无需LLM调用
- **性能收益**：重复文件场景下LLM调用减少90%+

### 10. 边界情况处理
- ✅ **空文件**：0字节文件 → 移入 `.trash/`
- ✅ **超大文件**：>1MB → 触发LLM判断（不直接读取内容）
- ✅ **无扩展名**：fallback到 `/temp/pending`，触发LLM判断
- ✅ **错误路径**：路径不存在 → 跳过并记录日志
- ✅ **符号链接**：检查原文件是否在保护路径内，在则跳过

---

## 三、分类规则（优先级 0-99）

### 优先级 0：豁免规则（永不移动）

| 规则 | 说明 |
|------|------|
| 根目录核心文件 | AGENTS.md、MEMORY.md、IDENTITY.md、USER.md、SOUL.md、TOOLS.md、HEARTBEAT.md |
| 根目录隐藏文件 | 以 `.` 开头的文件（如 `.gitignore`、`.env`） |
| 保护目录 | `/core/`、`/system/`、`/.trash/`、`.git/`、`/skills/`、`memory/`、`.learnings/` |

### 优先级 1：强规则（直接移入 .trash）

| 规则 | 目标路径 | 说明 |
|------|----------|------|
| `*.log` | /.trash | 日志文件 |
| `*.cache` | /.trash | 缓存文件 |
| `*.tmp` | /.trash | 临时文件 |
| `*.temp` | /.trash | 临时文件 |
| `__pycache__/` | /.trash | Python缓存目录 |
| `node_modules/` | /.trash | Node依赖目录（仅workspace根目录） |
| `*.traineddata` | /.trash | OCR语言包（无依赖） |

### 优先级 2：软规则（条件清理）

| 规则 | 条件 | 目标路径 |
|------|------|----------|
| 低重要性文件 | `importance=low` && `last_used > 7天` | /.trash |
| 长期未使用 | `last_used > 90天` | /.trash |

### 优先级 3：内容匹配规则

| 规则 | 目标路径 | 说明 |
|------|----------|------|
| 包含 `import\|require\|from\|include` | /dependencies/libs | 代码依赖文件 |
| `skill.json` | /skills | 技能定义文件 |

### 优先级 99：Fallback

| 规则 | 目标路径 | 说明 |
|------|----------|------|
| 未知类型 | /temp/pending | 待分类文件 |

---

## 四、执行流程（决策树）

```
开始清理
    │
    ▼
┌─────────────────────────────────────┐
│ 1. 保护路径检查                      │
│    - 是保护路径？→ 跳过             │
│    - 否 → 继续                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. 时间保护检查                      │
│    - last_used < 24h？→ 跳过        │
│    - importance = high？→ 跳过       │
│    - 否 → 继续                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 3. 强规则匹配                        │
│    - 匹配 *.log/*.cache/*.tmp/...？ │
│    - 是 → 直接移入 .trash            │
│    - 否 → 继续                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. 引用检查                          │
│    - 文件是否被其他文件引用？         │
│    - 是 → 跳过（保护依赖）           │
│    - 否 → 继续                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 5. 软规则匹配                        │
│    - 低重要性 && >7天？→ .trash      │
│    - >90天？→ .trash                │
│    - 否 → 继续                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 6. LLM 判断                          │
│    - 边界文件/未知文件               │
│    - confidence >= 0.6？→ 执行       │
│    - confidence < 0.6？→ 人工确认   │
└─────────────────────────────────────┘
    │
    ▼
执行 move_to_trash
    │
    ▼
记录 cleanup_log.json
```

---

## 五、工具 API

### classify_file

```json
{
  "path": "/path/to/file.txt",
  "content": "文件内容（可选，用于内容分析）"
}
```

**返回**：
```json
{
  "target_path": "/temp/pending",
  "type": "pending",
  "importance": "low",
  "rule_matched": "fallback",
  "priority": 99
}
```

### write_file

```json
{
  "path": "/docs/file.txt",
  "content": "文件内容",
  "metadata": {
    "type": "document",
    "importance": "high",
    "owner": "user"
  }
}
```

### scan_index

```json
{
  "type": "log",
  "importance": "low",
  "owner": "agent",
  "unused_days": 7,
  "refresh": false
}
```

### cleanup_workspace

```json
{
  "dry_run": false,
  "llm_enabled": true,
  "force_rules": ["strong", "soft"],
  "protected_paths": ["/core", "/system", "/.trash", ".git", "/skills", "memory", ".learnings"]
}
```

### move_to_trash

```json
{
  "path": "/temp/old.log",
  "reason": "超过90天未使用",
  "decision_by": "rule"
}
```

### llm_decide_file

```json
{
  "path": "/temp/unknown.dat",
  "metadata": {
    "type": "pending",
    "importance": "low",
    "owner": "agent",
    "created_at": "2024-01-01T00:00:00Z",
    "last_used_at": "2024-01-15T00:00:00Z",
    "size": 1024
  },
  "content_summary": "文件内容摘要..."
}
```

### llm_decide_batch（V2.1.4新增）

批量LLM决策，显著提升性能（10个文件从10次调用降至1次）。

```json
{
  "files": [
    {
      "path": "/temp/file1.txt",
      "metadata": {
        "type": "pending",
        "importance": "low",
        "owner": "agent",
        "size": 1024
      },
      "content_summary": "文件内容摘要1"
    },
    {
      "path": "/temp/file2.txt",
      "metadata": {
        "type": "pending",
        "importance": "low",
        "owner": "agent",
        "size": 2048
      },
      "content_summary": "文件内容摘要2"
    }
  ],
  "options": {
    "batch_size": 10,
    "use_cache": true
  }
}
```

**返回**：
```json
{
  "results": [
    {
      "path": "/temp/file1.txt",
      "decision": "keep",
      "reason": "包含敏感关键词",
      "confidence": 0.8,
      "cached": false
    },
    {
      "path": "/temp/file2.txt",
      "decision": "trash",
      "reason": "临时文件超过90天",
      "confidence": 0.7,
      "cached": true
    }
  ],
  "stats": {
    "total": 10,
    "processed": 10,
    "cached": 5,
    "batched": 1,
    "api_calls": 5,
    "hit_rate": 0.5
  }
}
```

**性能说明**：
- **批处理**：每批最多10个文件，合并为单个LLM调用
- **缓存**：基于文件路径、大小、内容哈希的MD5缓存
- **收益**：重复文件场景LLM调用减少90%+，响应时间降低80%+

---

## 六、目录结构

```
workspace/
├── /docs              # 文档文件（.md，非task-*）
├── /dependencies      # 依赖文件
│   └── /libs         # 代码库文件
├── /core              # 核心配置（受保护）
├── /skills            # 技能文件（受保护）
├── /temp              # 临时文件
│   ├── /logs         # 日志（清理目标）
│   ├── /cache        # 缓存（清理目标）
│   └── /pending      # 待分类（fallback目标）
├── /.trash            # 回收站（所有清理目标）
│   └── cleanup_log.json
├── /system            # 系统文件（受保护）
│   └── space_index.json
├── memory/            # 记忆文件（受保护）
├── .learnings/       # 学习文件（受保护）
└── AGENTS.md 等      # 核心文件（受保护）
```

---

## 七、配置

```json
{
  "trashPath": "/.trash",
  "protectedPaths": [
    "/core",
    "/system",
    "/.trash",
    ".git",
    "/skills",
    "memory",
    ".learnings"
  ],
  "protectedFiles": [
    "AGENTS.md",
    "MEMORY.md",
    "IDENTITY.md",
    "USER.md",
    "SOUL.md",
    "TOOLS.md",
    "HEARTBEAT.md"
  ],
  "protectedAgeHours": 24,
  "lowImportanceDays": 7,
  "unusedDays": 90,
  "llmDecisionThreshold": 0.6,
  "maxFileSizeForLLM": 1048576,
  "indexFile": "/system/space_index.json",
  "logFile": "/system/cleanup_log.json"
}
```

---

## 八、安全检查清单

清理前**必须**确认：

- [ ] 文件不在保护路径内
- [ ] 文件不是核心文件（AGENTS.md等）
- [ ] 文件不是根目录隐藏文件
- [ ] 文件未被其他文件引用
- [ ] last_used > 24小时
- [ ] importance != high
- [ ] decision_by 已记录（rule/llm/user）
- [ ] 目标路径是 /.trash（不是直接删除）

---

## 九、命令行使用

```bash
# 初始化工作空间
node runtime/main.js /path/to/workspace init

# 扫描索引
node runtime/main.js /path/to/workspace scan

# 清理预览（dry-run）
node runtime/main.js /path/to/workspace cleanup --dry-run

# 分类文件
node runtime/main.js /path/to/workspace classify /temp/test.log

# 强制清理（包括软规则）
node runtime/main.js /path/to/workspace cleanup --force
```

---

## 十、日志格式

### cleanup_log.json

```json
[
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/workspace/temp/old.log",
    "action": "move_to_trash",
    "reason": "超过90天未使用",
    "decision_by": "rule",
    "original_size": 1024,
    "trash_path": "/workspace/.trash/old_log_20240115.log"
  }
]
```

### space_index.json

```json
{
  "version": "2.1.4",
  "last_updated": "2024-01-15T10:30:00Z",
  "files": [
    {
      "path": "/workspace/docs/readme.md",
      "type": "document",
      "importance": "high",
      "owner": "agent",
      "created_at": "2024-01-01T00:00:00Z",
      "last_used_at": "2024-01-15T10:30:00Z",
      "size": 2048
    }
  ]
}
```
