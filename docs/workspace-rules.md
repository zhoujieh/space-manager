# Workspace 文件目录与分类规则

## 📂 目录结构

```
/
├── docs/           # 文档类文件（Markdown、纯文本、说明文档）
├── temp/           # 临时文件（自动清理）
│   ├── logs/       # 日志文件（*.log）
│   ├── cache/      # 缓存文件（*.cache）
│   └── pending/    # 待分类文件
├── dependencies/   # 依赖文件
│   └── libs/       # 库文件（含 import/require/from 的代码）
├── core/           # 核心文件（保护，agent 只读）
├── system/         # 系统文件（保护，space-manager 内部使用）
└── .trash/         # 回收站（删除文件移至此）
```

## 🎯 文件分类规则（优先级顺序）

| 优先级 | 条件 | 目标路径 | 说明 |
|--------|------|----------|------|
| 0 | 根目录核心文件<br/>（AGENTS.md, MEMORY.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md） | **原地不动** | 最高优先级：这些文件永远不移动 |
| 0 | 根目录隐藏文件<br/>（以 `.` 开头，如 `.git/`, `.trash/`, `.openclaw/`） | **原地不动** | 系统目录，禁止移动 |
| 1 | 后缀 `.log` | `/temp/logs/` | 程序日志文件 |
| 1 | 后缀 `.cache` | `/temp/cache/` | 缓存文件 |
| 1 | 后缀 `.tmp` `.temp` | `/temp/pending/` | 临时文件 |
| 2 | 后缀 `.md` `.txt` `.json` `.yaml` `.yml`（子目录） | **原地保留** | 文档和配置文件原地保留 |
| 3 | 后缀 `.js` `.py` `.ts` | `/dependencies/libs/` | 源代码文件 |
| 3 | 文件名 `skill.json` 或以 `skill-` 开头 | `/skills/` | 技能相关文件 |
| 4 | 内容包含 `import`/`require`/`from`/`include` 等导入语句 | `/dependencies/libs/` | 依赖文件（需提供内容） |
| 99 | 未知类型，不匹配以上任何规则 | `/temp/pending/` | 无法分类的文件 |

### 重要说明

1. **优先级顺序**：数字越小优先级越高。匹配到规则后不再继续匹配。
2. **原地保留**：`target: null` 表示文件保持当前位置，不移动。
3. **根目录豁免**：根目录下的核心文件和隐藏文件永远不移动，这是最高优先级规则。
4. **内容匹配**：仅当提供文件内容时生效（适用于代码文件中的依赖检测）。

## 📝 操作流程

### 写入新文件
1. 根据文件路径、后缀和内容（如果可用）确定分类
2. 如果匹配到移动规则，文件将被移动到目标目录
3. 如果匹配到原地保留规则，文件将保持在当前位置
4. 更新空间索引

### 自动清理规则
space-manager 定期自动清理：
- `/temp/logs/*.log` > 7天 → 移入 `.trash/`
- `/temp/cache/*.cache` > 3天 → 移入 `.trash/`
- `/temp/pending/*` > 30天 → 移入 `.trash/`

### 保护规则
以下目录和文件永不清理：
- `/core/`, `/system/`, `/.trash/`, `.git/`, `.openclaw/`, `.qclaw/`
- 根目录核心文件（AGENTS.md 等）
- 重要性为 `high` 的文件
- 最近24小时内使用过的文件

## 🛠️ 工具调用

### 分类单个文件
```bash
# 使用 space-manager 命令行工具
cd /path/to/workspace
node ~/.qclaw/skills/space-manager/runtime/main.js classify /path/to/file

# 或使用 Python 脚本
python3 ~/.qclaw/skills/space-manager/scripts/classify.py /path/to/file
```

### 批量分类工作区
```bash
# 扫描整个 workspace，预览分类结果
python3 ~/.qclaw/skills/space-manager/scripts/classify_all.py --dry-run

# 实际执行分类
python3 ~/.qclaw/skills/space-manager/scripts/classify_all.py --execute
```

### 清理工作区
```bash
# 预览清理操作
node ~/.qclaw/skills/space-manager/runtime/main.js cleanup --dry-run

# 执行清理
node ~/.qclaw/skills/space-manager/runtime/main.js cleanup
```

## 🔧 集成使用

### 在 Agent 中调用
```javascript
const SpaceManager = require('~/.qclaw/skills/space-manager/runtime/main.js');
const manager = new SpaceManager('/path/to/workspace');

// 分类文件
const result = await manager.classifyFile('/path/to/file.txt');

// 写入文件（自动分类）
await manager.writeFile('new_file.md', '# Content', {
  type: 'document',
  importance: 'normal'
});
```

### 在 Python 脚本中调用
```python
import sys
sys.path.append('~/.qclaw/skills/space-manager/scripts')
from classify import classify_file

result = classify_file('/path/to/file.txt')
print(f"Target path: {result['target_path']}")
```

---

**版本**：V2.1.5 (Bug Fix)  
**最后更新**：2026-04-21  
**对应分类器版本**：classifier.js (priority-based rules)  
**修复内容**：init 后索引为空导致误清理问题
