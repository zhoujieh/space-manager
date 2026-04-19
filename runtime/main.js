/**
 * Space Manager - Main Entry Point
 * 空间文件管理 + 自动清理 + LLM判断系统
 */

const fs = require('fs');
const path = require('path');
const Classifier = require('./classifier');
const Cleanup = require('./cleanup');
const Index = require('./index');
const LLM = require('./llm');

class SpaceManager {
  constructor(workspacePath, config = {}) {
    this.workspacePath = workspacePath;
    this.config = {
      trashPath: '/.trash',
      protectedPaths: ['/core', '/system', '/.trash', '/skills'],
      protectedAgeHours: 24,
      lowImportanceDays: 7,
      unusedDays: 90,
      llmDecisionThreshold: 0.7,
      ...config
    };

    this.classifier = new Classifier(this);
    this.cleanup = new Cleanup(this);
    this.index = new Index(this);
    this.llm = new LLM(this);
  }

  /**
   * 初始化工作空间
   * 创建默认目录结构和索引文件
   */
  async initialize() {
    // 创建所有必要的目录
    const dirs = [
      '/docs',
      '/dependencies',
      '/core',
      '/skills',
      '/temp',
      '/temp/logs',
      '/temp/cache',
      '/temp/pending',
      '/.trash',
      '/system'
    ];

    for (const dir of dirs) {
      const fullPath = path.join(this.workspacePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`[Init] Created directory: ${dir}`);
      }
    }

    // 创建索引文件
    const indexPath = path.join(this.workspacePath, '/system/space_index.json');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, JSON.stringify({ files: [] }, null, 2));
      console.log('[Init] Created space_index.json');
    }

    // 创建清理日志
    const logPath = path.join(this.workspacePath, '/system/cleanup_log.json');
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, JSON.stringify({ logs: [] }, null, 2));
      console.log('[Init] Created cleanup_log.json');
    }

    // 更新 AGENTS.md，添加文件规则引用（最高优先级声明）
    await this.updateAgentsMdWithRulesReference();

    return {
      success: true,
      message: 'Workspace initialized',
      directories: dirs
    };
  }

  /**
   * 更新 AGENTS.md，添加文件规则引用（最高优先级声明）
   */
  async updateAgentsMdWithRulesReference() {
    // 规则文档路径
    const rulesDocPath = path.join(__dirname, '../docs/workspace-rules.md');
    const agentsPath = path.join(this.workspacePath, 'AGENTS.md');
    
    // 构建引用内容
    const referenceSection = `## ⚠️ 最高优先级：文件写入规则（强制阅读）

在操作本 workspace 的任何文件前，**必须**阅读文件写入规则：

**强制文档**：\`${rulesDocPath}\`

### 该文档包含
1. **目录结构说明** - 每个目录的用途
2. **文件分类规则** - 什么文件放哪里（优先级表）
3. **操作流程** - 如何写入、清理文件
4. **工具调用** - 分类和清理工具使用方法

**重要**：所有文件操作必须遵循上述规则。违反规则可能导致数据丢失或 workspace 损坏。

---

`;

    try {
      if (!fs.existsSync(agentsPath)) {
        // 新 workspace：创建完整 AGENTS.md
        const defaultContent = `# AGENTS.md - Your Workspace

${referenceSection}
This folder is home. Treat it that way.

## First Run

If \`BOOTSTRAP.md\` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

## Session Startup

Before doing anything else:

1. Read \`SOUL.md\` — this is who you are
2. Read \`USER.md\` — this is who you're helping
3. Read \`memory/YYYY-MM-DD.md\` (today + yesterday) for recent context
4. **If in MAIN SESSION** (direct chat with your human): Also read \`MEMORY.md\`

Don't ask permission. Just do it.`;
        
        fs.writeFileSync(agentsPath, defaultContent, 'utf8');
        console.log('[Init] Created AGENTS.md with rules reference');
      } else {
        // 已有 AGENTS.md：检查是否已有引用
        const existingContent = fs.readFileSync(agentsPath, 'utf8');
        
        if (existingContent.includes('最高优先级：文件写入规则')) {
          console.log('[Init] AGENTS.md already has rules reference, skipping');
          return;
        }
        
        // 在标题后插入引用
        const lines = existingContent.split('\n');
        let newContent = '';
        
        // 找到标题行（以 # 开头）
        let titleIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith('# ')) {
            titleIndex = i;
            break;
          }
        }
        
        if (titleIndex >= 0) {
          // 在标题行后插入
          const before = lines.slice(0, titleIndex + 1);
          const after = lines.slice(titleIndex + 1);
          newContent = before.join('\n') + '\n\n' + referenceSection + after.join('\n');
        } else {
          // 没有标题，直接添加到开头
          newContent = referenceSection + existingContent;
        }
        
        fs.writeFileSync(agentsPath, newContent, 'utf8');
        console.log('[Init] Updated AGENTS.md with rules reference');
      }
    } catch (error) {
      console.error('[Init] Failed to update AGENTS.md:', error.message);
      // 不抛出错误，初始化继续
    }
  }

  /**
   * 分类文件
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容（可选）
   */
  async classifyFile(filePath, content = null) {
    return this.classifier.classify(filePath, content);
  }

  /**
   * 写入文件
   * @param {string} targetPath - 目标路径
   * @param {string} content - 文件内容
   * @param {object} metadata - 元数据
   */
  async writeFile(targetPath, content, metadata = {}) {
    const fullPath = path.join(this.workspacePath, targetPath);

    // 创建目录
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(fullPath, content, 'utf8');

    // 更新索引
    const now = new Date().toISOString();
    const fileInfo = {
      path: targetPath,
      type: metadata.type || 'unknown',
      importance: metadata.importance || 'normal',
      owner: metadata.owner || 'agent',
      created_at: metadata.created_at || now,
      last_used_at: now,
      size: Buffer.byteLength(content, 'utf8')
    };

    await this.index.addOrUpdate(fileInfo);

    return {
      success: true,
      path: targetPath,
      size: fileInfo.size,
      indexed: true
    };
  }

  /**
   * 扫描索引
   * @param {object} filters - 过滤条件
   */
  async scanIndex(filters = {}) {
    return this.index.scan(filters);
  }

  /**
   * 清理工作空间
   * @param {object} options - 清理选项
   */
  async cleanupWorkspace(options = {}) {
    return this.cleanup.run(options);
  }

  /**
   * 移动文件到回收站
   * @param {string} filePath - 文件路径
   * @param {string} reason - 原因
   * @param {string} decisionBy - 决策来源
   */
  async moveToTrash(filePath, reason, decisionBy = 'rule') {
    // 确保文件路径不以/开头（path.join会忽略workspacePath）
    const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const fullPath = path.join(this.workspacePath, normalizedPath);
    const trashPath = path.join(this.workspacePath, this.config.trashPath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${fullPath} (original: ${filePath})`
      };
    }

    // 生成回收站文件名（包含Base64编码的原始路径）
    const timestamp = Date.now();
    const basename = path.basename(filePath);
    // 使用URL安全的Base64编码，避免特殊字符
    // 编码原始路径（带/前缀）
    const encodedPath = Buffer.from(filePath).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const trashFileName = `${basename}_${timestamp}_${encodedPath}`;
    const trashFilePath = path.join(trashPath, trashFileName);

    // 确保回收站存在
    if (!fs.existsSync(trashPath)) {
      fs.mkdirSync(trashPath, { recursive: true });
    }

    let moved = false;
    let logged = false;
    let indexUpdated = false;
    
    try {
      // 第一步：移动文件
      fs.renameSync(fullPath, trashFilePath);
      moved = true;
      
      // 第二步：记录日志
      await this.logCleanup({
        timestamp: new Date().toISOString(),
        action: 'move_to_trash',
        path: filePath,
        reason,
        decision_by: decisionBy
      });
      logged = true;
      
      // 第三步：更新索引
      await this.index.remove(filePath);
      indexUpdated = true;
      
      return {
        success: true,
        original_path: filePath,
        trash_path: `/.trash/${trashFileName}`,
        logged: true,
        atomic: true
      };
    } catch (error) {
      // 事务回滚
      if (moved && !indexUpdated) {
        try {
          // 尝试将文件移回原处
          if (fs.existsSync(trashFilePath)) {
            fs.renameSync(trashFilePath, fullPath);
          }
        } catch (rollbackError) {
          console.error(`事务回滚失败: ${rollbackError.message}`);
        }
      }
      
      // 如果日志已记录但索引未更新，记录警告
      if (logged && !indexUpdated) {
        console.warn(`事务部分成功：文件已移动且日志已记录，但索引未更新: ${error.message}`);
      }
      
      return {
        success: false,
        error: `事务失败: ${error.message}`,
        rolled_back: moved && !indexUpdated,
        atomic_failure: true
      };
    }
  }

  /**
   * 从回收站恢复文件
   * @param {string} trashFileName - 回收站中的文件名（如 file.txt_1234567890）
   * @param {string} targetPath - 恢复到的目标路径（可选，默认原路径）
   */
  async restoreFromTrash(trashFileName, targetPath = null) {
    const trashPath = path.join(this.workspacePath, this.config.trashPath);
    const trashFilePath = path.join(trashPath, trashFileName);

    if (!fs.existsSync(trashFilePath)) {
      return {
        success: false,
        error: '回收站文件不存在'
      };
    }

    let originalPath = targetPath;

    // 如果没有提供目标路径，尝试从文件名解析
    if (!originalPath) {
      // 新格式：basename_timestamp_encodedPath
      const match = trashFileName.match(/^(.+)_(\d+)_(.+)$/);
      if (match) {
        try {
          // URL安全Base64解码：将-和_还原为+和/
          let encodedPath = match[3]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          // 添加padding（Base64需要4的倍数长度）
          while (encodedPath.length % 4) {
            encodedPath += '=';
          }
          originalPath = Buffer.from(encodedPath, 'base64').toString('utf8');
        } catch (e) {
          console.warn(`[Restore] 无法解析编码路径，使用旧格式回退: ${e.message}`);
          originalPath = null;
        }
      }

      // 旧格式回退：basename_timestamp
      if (!originalPath) {
        const oldMatch = trashFileName.match(/^(.+)_(\d+)$/);
        if (oldMatch) {
          originalPath = `/${oldMatch[1]}`;
        } else {
          return {
            success: false,
            error: '无效的回收站文件名格式'
          };
        }
      }
    }
    
    // 确保路径不以/开头
    const normalizedPath = originalPath.startsWith('/') ? originalPath.substring(1) : originalPath;
    const targetFullPath = path.join(this.workspacePath, normalizedPath);
    
    // 确保目标目录存在
    const targetDir = path.dirname(targetFullPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 检查目标文件是否已存在
    if (fs.existsSync(targetFullPath)) {
      return {
        success: false,
        error: '目标文件已存在'
      };
    }
    
    try {
      // 移动文件回原位置
      fs.renameSync(trashFilePath, targetFullPath);
      
      // 更新索引
      try {
        const stats = fs.statSync(targetFullPath);
        await this.index.addOrUpdate({
          path: normalizedPath,
          size: stats.size,
          type: 'file',
          source: 'restore',
          restored_at: new Date().toISOString()
        });
      } catch (indexError) {
        console.warn(`[Restore] 索引更新失败: ${indexError.message}`);
        // 继续执行，索引更新不是关键操作
      }
      
      // 记录恢复日志
      await this.logCleanup({
        timestamp: new Date().toISOString(),
        action: 'restore_from_trash',
        path: originalPath,
        trash_file: trashFileName,
        reason: '用户请求恢复'
      });
      
      return {
        success: true,
        original_path: originalPath,
        trash_file: trashFileName,
        restored_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `恢复失败: ${error.message}`
      };
    }
  }

  /**
   * LLM判断文件
   * @param {string} filePath - 文件路径
   * @param {object} metadata - 元数据
   * @param {string} contentSummary - 内容摘要
   */
  async llmDecideFile(filePath, metadata = {}, contentSummary = '') {
    return this.llm.decide(filePath, metadata, contentSummary);
  }

  /**
   * 记录清理日志
   * @param {object} entry - 日志条目
   */
  async logCleanup(entry) {
    const logPath = path.join(this.workspacePath, '/system/cleanup_log.json');

    let log = { logs: [] };
    if (fs.existsSync(logPath)) {
      log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }

    log.logs.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  }
}

module.exports = SpaceManager;

// CLI 入口
if (require.main === module) {
  const workspacePath = process.argv[2] || process.cwd();
  const action = process.argv[3];

  const manager = new SpaceManager(workspacePath);

  (async () => {
    try {
      switch (action) {
        case 'init':
          const result = await manager.initialize();
          console.log(JSON.stringify(result, null, 2));
          break;
        case 'scan':
          const files = await manager.scanIndex();
          console.log(JSON.stringify(files, null, 2));
          break;
        case 'cleanup':
          const cleanupResult = await manager.cleanupWorkspace({
            dryRun: process.argv.includes('--dry-run')
          });
          console.log(JSON.stringify(cleanupResult, null, 2));
          break;
        case 'classify':
          const filePath = process.argv[4];
          const classifyResult = await manager.classifyFile(filePath);
          console.log(JSON.stringify(classifyResult, null, 2));
          break;
        default:
          console.log('Usage: node main.js <workspace> <init|scan|cleanup|classify> [options]');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}
