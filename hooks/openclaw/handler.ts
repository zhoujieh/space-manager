/**
 * Space Manager Init Hook for OpenClaw
 * 
 * Injects space-manager rules reference into AGENTS.md during agent bootstrap.
 * Fires on agent:bootstrap event before workspace files are injected.
 */

import type { HookHandler } from 'openclaw/hooks';
import * as fs from 'fs';
import * as path from 'path';

const SPACE_MANAGER_RULES = `
## 📁 Space Manager（强制阅读）

> **⚠️ 范围说明**：本技能仅管理 **OpenClaw agent workspace**（\`~/.qclaw/workspace-*\`），**不是电脑桌面**。
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
| **强规则** | \`*.log\`, \`*.cache\`, \`*.tmp\`, \`__pycache__/\`, \`node_modules/\` → 直接移入 .trash |
| **软规则** | importance=low 且 >7天未用 → .trash |
| **保护规则** | \`/core/\`, \`/system/\`, \`/.trash/\`, \`.git/\`, \`*.md\` 永不触碰 |
| **LLM判断** | 边界文件使用 LLM 决策（置信度 < 0.6 时需人工确认） |

### 回收站路径

\`\`\`
~/.qclaw/workspace-agent-513a8f51/.trash/
\`\`\`

### 详细文档

完整规则见技能目录：\`~/.qclaw/skills/space-manager/SKILL.md\`
`;

const handler: HookHandler = async (event) => {
  // Safety checks for event structure
  if (!event || typeof event !== 'object') {
    return;
  }

  // Only handle agent:bootstrap events
  if (event.type !== 'agent' || event.action !== 'bootstrap') {
    return;
  }

  // Safety check for context
  if (!event.context || typeof event.context !== 'object') {
    return;
  }

  // Skip sub-agent sessions
  const sessionKey = event.sessionKey || '';
  if (sessionKey.includes(':subagent:')) {
    return;
  }

  // Get workspace path from context
  const workspacePath = event.context.workspacePath || process.env.WORKSPACE_PATH;
  if (!workspacePath) {
    return;
  }

  const agentsPath = path.join(workspacePath, 'AGENTS.md');

  try {
    // Check if AGENTS.md exists
    let agentsContent = '';
    if (fs.existsSync(agentsPath)) {
      agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    }

    // Check if space-manager rules already exist
    if (agentsContent.includes('## 📁 Space Manager')) {
      // Already has the rules, skip
      return;
    }

    // Append space-manager rules to AGENTS.md
    const updatedContent = agentsContent + '\n' + SPACE_MANAGER_RULES;
    fs.writeFileSync(agentsPath, updatedContent, 'utf-8');

    console.log('[space-manager-init] Successfully appended rules to AGENTS.md');

  } catch (error) {
    console.error('[space-manager-init] Error updating AGENTS.md:', (error as Error).message);
  }
};

export default handler;
