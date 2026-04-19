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
      protectedPaths: ['/system', '/.trash'],
      protectedAgeHours: 24,
      lowImportanceDays: 7,
      unusedDays: 90,
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

    return {
      success: true,
      message: 'Workspace initialized',
      directories: dirs
    };
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
    const fullPath = path.join(this.workspacePath, filePath);
    const trashPath = path.join(this.workspacePath, this.config.trashPath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: 'File not found'
      };
    }

    // 生成回收站文件名
    const timestamp = Date.now();
    const basename = path.basename(filePath);
    const trashFileName = `${basename}_${timestamp}`;
    const trashFilePath = path.join(trashPath, trashFileName);

    // 确保回收站存在
    if (!fs.existsSync(trashPath)) {
      fs.mkdirSync(trashPath, { recursive: true });
    }

    // 移动文件
    fs.renameSync(fullPath, trashFilePath);

    // 记录日志
    await this.logCleanup({
      timestamp: new Date().toISOString(),
      action: 'move_to_trash',
      path: filePath,
      reason,
      decision_by: decisionBy
    });

    // 更新索引
    await this.index.remove(filePath);

    return {
      success: true,
      original_path: filePath,
      trash_path: `/.trash/${trashFileName}`,
      logged: true
    };
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
