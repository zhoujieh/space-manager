# Space Manager

空间文件管理 + 自动清理 + LLM判断系统

## 🎯 功能

- **自动分类**：基于文件名、扩展名、内容关键词智能分类
- **自动清理**：强规则 + 软规则清理，只移入 .trash（不删除）
- **LLM判断**：边界文件使用 LLM 决策保留/清理
- **索引管理**：维护 space_index.json，支持查询统计

## 📁 目录结构

```
workspace/
├── /docs           # 文档文件
├── /dependencies   # 依赖文件
├── /core           # 核心配置
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

## 🚀 快速开始

### 初始化

```javascript
const SpaceManager = require('./runtime/main');

const manager = new SpaceManager('/path/to/workspace');
await manager.initialize();
```

### 命令行

```bash
# 初始化
node runtime/main.js /path/to/workspace init

# 扫描索引
node runtime/main.js /path/to/workspace scan

# 清理（dry-run）
node runtime/main.js /path/to/workspace cleanup --dry-run

# 分类文件
node runtime/main.js /path/to/workspace classify /temp/test.log
```

## 📋 工具 API

### classify_file

分类文件，返回目标路径和类型。

```javascript
const result = await manager.classifyFile('/temp/test.log');
// {
//   target_path: '/temp/logs/test.log',
//   type: 'log',
//   importance: 'low',
//   rule_matched: 'log_file',
//   priority: 1
// }
```

### write_file

写入文件，自动添加元数据并更新索引。

```javascript
await manager.writeFile('/docs/readme.md', '# Hello', {
  type: 'document',
  importance: 'high',
  owner: 'user'
});
```

### scan_index

扫描索引，支持过滤。

```javascript
const result = await manager.scanIndex({
  type: 'log',
  importance: 'low',
  unused_days: 7
});
```

### cleanup_workspace

执行清理。

```javascript
const result = await manager.cleanupWorkspace({
  dryRun: false,
  llmEnabled: true
});
```

### move_to_trash

移动文件到回收站。

```javascript
await manager.moveToTrash('/temp/old.log', '超过90天未使用', 'rule');
```

### llm_decide_file

LLM判断文件。

```javascript
const decision = await manager.llmDecideFile(
  '/temp/unknown.dat',
  { type: 'unknown', size: 1024 },
  '文件内容摘要...'
);
// {
//   decision: 'keep',
//   reason: '无法确定，建议保留',
//   confidence: 0.4
// }
```

## 🔒 清理规则

### 强规则（直接清理）

| 规则 | 目标 |
|------|------|
| `*.log` | /.trash |
| `*.cache` | /.trash |
| `*.tmp`, `*.temp` | /.trash |
| `__pycache__/` | /.trash |
| `node_modules/` | /.trash |
| `*.traineddata` | /.trash |
| `.DS_Store` | /.trash |

### 软规则（条件清理）

| 条件 | 操作 |
|------|------|
| importance=low 且 >7天未使用 | 移入 .trash |
| >90天未使用 | 移入 .trash |
| 0字节且>7天 | 直接删除 |

### 保护规则

以下路径**永不清理**：
- `/core/` - 核心配置
- `/system/` - 系统索引
- `/.trash/` - 回收站
- `.git/` - 版本控制

以下文件**跳过清理**：
- last_used < 24小时
- importance = high
- 包含豁免关键词（AGENTS, MEMORY, SECRET 等）

## 📊 索引结构

```json
{
  "files": [
    {
      "path": "/docs/readme.md",
      "type": "document",
      "importance": "normal",
      "owner": "agent",
      "created_at": "2026-04-18T15:00:00Z",
      "last_used_at": "2026-04-18T16:00:00Z",
      "size": 1024
    }
  ]
}
```

## 📝 清理日志

```json
{
  "logs": [
    {
      "timestamp": "2026-04-18T15:00:00Z",
      "action": "move_to_trash",
      "path": "/temp/old.log",
      "reason": "强规则: 日志文件",
      "decision_by": "rule"
    }
  ]
}
```

## ⚙️ 配置

```json
{
  "trashPath": "/.trash",
  "protectedPaths": ["/core", "/system", "/.trash"],
  "protectedAgeHours": 24,
  "lowImportanceDays": 7,
  "unusedDays": 90,
  "llmDecisionThreshold": 0.3
}
```

## 🔧 扩展

### 添加自定义分类规则

```javascript
manager.classifier.addRule({
  pattern: /\.custom$/i,
  target: '/custom',
  type: 'custom',
  importance: 'normal',
  priority: 10
});
```

### 自定义 LLM 判断

```javascript
// 设置置信度阈值
manager.llm.setConfidenceThreshold(0.7);

// 获取决策历史
const history = manager.llm.getHistory();
```

## 📄 License

MIT
