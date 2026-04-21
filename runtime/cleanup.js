/**
 * Workspace Cleanup
 * 工作空间清理器 - 基于规则清理文件（只移动到 .trash，不删除）
 */

const fs = require('fs');
const path = require('path');

class Cleanup {
  constructor(manager) {
    this.manager = manager;
    this.config = manager.config;

    // 强规则：直接清理
    this.strongRules = [
      { pattern: /\.log$/i, reason: '强规则: 日志文件' },
      { pattern: /\.cache$/i, reason: '强规则: 缓存文件' },
      { pattern: /\.tmp$/i, reason: '强规则: 临时文件' },
      { pattern: /\.temp$/i, reason: '强规则: 临时文件' },
      { pattern: /__pycache__/i, reason: '强规则: Python缓存目录' },
      { pattern: /node_modules$/i, reason: '强规则: Node依赖目录' },
      { pattern: /\.pyc$/i, reason: '强规则: Python编译文件' },
      { pattern: /\.pyo$/i, reason: '强规则: Python优化文件' },
      { pattern: /\.swp$/i, reason: '强规则: Vim交换文件' },
      { pattern: /\.swo$/i, reason: '强规则: Vim交换文件' },
      { pattern: /~$/i, reason: '强规则: 编辑器备份文件' },
      { pattern: /\.bak$/i, reason: '强规则: 备份文件' },
      { pattern: /\.DS_Store$/i, reason: '强规则: macOS系统文件' },
      { pattern: /Thumbs\.db$/i, reason: '强规则: Windows缩略图' },
      { pattern: /\.traineddata$/i, reason: '强规则: 无依赖语言包' }
    ];

    // 豁免关键词
    this.exemptKeywords = [
      'AGENTS', 'MEMORY', 'USER', 'SOUL', 'TOOLS', 'IDENTITY', 'HEARTBEAT',
      'secret', 'password', 'token', 'key', 'credential', 'private',
      'backup', 'database', 'config'
    ];

    // 批处理配置
    this.batchSize = 10;
    this.pendingLLMFiles = [];
  }

  /**
   * 执行清理
   * @param {object} options - 清理选项
   */
  async run(options = {}) {
    const {
      dryRun = false,
      llmEnabled = true,
      forceRules = null
    } = options;

    const result = {
      scanned_files: 0,
      cleaned_files: 0,
      cleaned_size: 0,
      skipped_files: 0,
      llm_decisions: 0,
      errors: [],
      actions: []
    };

    // 获取索引
    const index = await this.manager.scanIndex();
    const files = index.files || [];
    result.scanned_files = files.length;

    // 收集需要LLM判断的文件（用于批处理）
    const llmPendingFiles = [];

    for (const file of files) {
      try {
        // 检查保护路径
        if (this.isProtectedPath(file.path)) {
          result.skipped_files++;
          continue;
        }

        // 检查热文件（24小时内使用过）- 时间保护 > 一切清理规则
        if (this.isHotFile(file)) {
          result.skipped_files++;
          continue;
        }

        // 检查metadata可信度（V2.1新增）
        const metadataTrusted = this.isMetadataTrusted(file);
        // 如果metadata不可信，降级importance为low
        if (!metadataTrusted && file.importance !== 'high') {
          file.importance = 'low';
        }

        // 检查引用（V2.1新增：强制引用检查在规则匹配之前）
        const referenced = this.isFileReferenced(file.path);
        if (referenced) {
          // 文件被引用，禁止清理
          result.skipped_files++;
          continue;
        }

        // 检查豁免关键词
        if (this.hasExemptKeyword(file.path)) {
          result.skipped_files++;
          continue;
        }

        // 检查强规则
        const strongMatch = this.matchStrongRule(file.path);
        if (strongMatch) {
          if (!dryRun) {
            await this.manager.moveToTrash(file.path, strongMatch.reason, 'rule');
          }
          result.cleaned_files++;
          result.cleaned_size += file.size || 0;
          result.actions.push({
            path: file.path,
            action: 'move_to_trash',
            reason: strongMatch.reason,
            decision_by: 'rule',
            rule_stage: 'strong',
            reference_checked: true,
            metadata_trusted: metadataTrusted,
            file_importance: file.importance
          });
          continue;
        }

        // 检查软规则
        const softMatch = this.matchSoftRule(file);
        if (softMatch) {
          if (!dryRun) {
            await this.manager.moveToTrash(file.path, softMatch.reason, 'rule');
          }
          result.cleaned_files++;
          result.cleaned_size += file.size || 0;
          result.actions.push({
            path: file.path,
            action: 'move_to_trash',
            reason: softMatch.reason,
            decision_by: 'rule',
            rule_stage: 'soft',
            reference_checked: true,
            metadata_trusted: metadataTrusted,
            file_importance: file.importance
          });
          continue;
        }

        // 检查删除规则（0字节文件）- 修改为移入.trash/，禁止直接删除
        if (this.shouldDeleteDirect(file, referenced)) {
          if (!dryRun) {
            // 移入.trash/，禁止直接删除
            await this.manager.moveToTrash(file.path, '0字节文件超过7天', 'rule');
            // moveToTrash内部已更新索引，无需额外调用index.remove
          }
          result.cleaned_files++;
          result.actions.push({
            path: file.path,
            action: 'move_to_trash',
            reason: '0字节文件超过7天',
            decision_by: 'rule',
            rule_stage: 'direct_delete',
            reference_checked: true,
            metadata_trusted: metadataTrusted,
            file_importance: file.importance
          });
          continue;
        }

        // LLM判断（V2.1明确边界）- 收集待批处理
        if (llmEnabled && this.shouldAskLLM(file, file.path, referenced)) {
          // 收集需要LLM判断的文件，稍后批量处理
          llmPendingFiles.push({
            path: file.path,
            file: file,
            metadataTrusted: metadataTrusted,
            referenced: referenced
          });
        } else {
          result.skipped_files++;
        }

      } catch (err) {
        result.errors.push({
          path: file.path,
          error: err.message
        });
      }
    }

    // 批量处理LLM决策（性能优化：10个文件从10次LLM调用降至1次）
    if (llmEnabled && llmPendingFiles.length > 0) {
      try {
        const batchResult = await this.batchLLMDecisions(llmPendingFiles, dryRun, result);
        console.log(`[Cleanup] 批处理总结: ${batchResult.processed} 文件处理, ${batchResult.cleaned} 文件清理`);
      } catch (err) {
        result.errors.push({
          phase: 'batch_llm_decisions',
          error: err.message
        });
        console.error(`[Cleanup] LLM批处理失败: ${err.message}`);
      }
    }

    // V2.1: cleanup后检查索引一致性
    if (!dryRun && result.cleaned_files > 0) {
      try {
        await this.manager.index.checkConsistency();
      } catch (err) {
        // 记录错误但不中断
        result.errors.push({
          phase: 'post_cleanup_consistency_check',
          error: err.message
        });
      }
    }

    return result;
  }

  /**
   * 检查是否为保护路径
   * @param {string} filePath - 文件路径
   * @returns {boolean} true表示受保护
   */
  isProtectedPath(filePath) {
    for (const protectedPath of this.config.protectedPaths) {
      // 精确匹配或目录前缀匹配（避免 /coredata 匹配 /core）
      if (filePath === protectedPath ||
          filePath.startsWith(protectedPath + '/') ||
          filePath.startsWith(protectedPath + '\')) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否为热文件（24小时内使用过）
   */
  isHotFile(file) {
    if (!file.last_used_at) return false;
    const lastUsed = new Date(file.last_used_at);
    const now = new Date();
    const hours = (now - lastUsed) / (1000 * 60 * 60);
    return hours < this.config.protectedAgeHours;
  }

  /**
   * 检查是否包含豁免关键词
   */
  hasExemptKeyword(filePath) {
    const basename = path.basename(filePath).toUpperCase();
    return this.exemptKeywords.some(keyword =>
      basename.includes(keyword.toUpperCase())
    );
  }

  /**
   * 检查node_modules保护条件（必须全部满足才允许清理）
   * @param {string} filePath - 文件路径
   * @returns {boolean} true表示允许清理，false表示保护
   */
  checkNodeModulesConditions(filePath) {
    const fs = require('fs');
    const path = require('path');
    const workspacePath = this.manager.workspacePath;

    // 获取完整路径
    const fullPath = path.join(workspacePath, filePath.startsWith('/') ? filePath.substring(1) : filePath);

    // 1. 检查路径是否包含node_modules
    if (!fullPath.includes('node_modules')) {
      return true; // 不是node_modules路径，不需要保护检查
    }

    // 2. 向上遍历查找package.json和lock文件
    let currentDir = fullPath;

    // 如果是文件，从父目录开始
    try {
      const stat = fs.lstatSync(fullPath);
      if (stat.isFile() || stat.isSymbolicLink()) {
        currentDir = path.dirname(fullPath);
      } else if (stat.isDirectory()) {
        currentDir = fullPath;
      }
    } catch (e) {
      return false; // 无法访问，保守起见保护
    }

    // 向上遍历目录树，直到workspace根目录
    while (currentDir && currentDir.startsWith(workspacePath)) {
      // 检查当前目录是否有package.json
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        return false; // 存在package.json，保护此node_modules
      }

      // 检查lock文件
      const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
      for (const lockFile of lockFiles) {
        const lockFilePath = path.join(currentDir, lockFile);
        if (fs.existsSync(lockFilePath)) {
          return false; // 存在lock文件，保护此node_modules
        }
      }

      // 向上移动到父目录
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir || parentDir.length < workspacePath.length) {
        break; // 到达根目录或超出workspace
      }
      currentDir = parentDir;
    }

    // 没有找到package.json或lock文件，允许清理
    return true;
  }

  /**
   * 匹配强规则
   */
  matchStrongRule(filePath) {
    for (const rule of this.strongRules) {
      if (rule.pattern.test(filePath)) {
        // 对node_modules特殊处理
        if (rule.pattern.toString().includes('node_modules')) {
          // 检查保护条件
          if (!this.checkNodeModulesConditions(filePath)) {
            return null; // 不满足保护条件，不清理
          }
        }
        return rule;
      }
    }
    return null;
  }

  /**
   * 匹配软规则
   */
  matchSoftRule(file) {
    const now = new Date();
    const lastUsed = file.last_used_at ? new Date(file.last_used_at) : null;
    const created = file.created_at ? new Date(file.created_at) : null;

    // 低重要性且超过7天未使用
    if (file.importance === 'low' && lastUsed) {
      const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
      if (days > this.config.lowImportanceDays) {
        return { reason: `软规则: 低重要性且超过${this.config.lowImportanceDays}天未使用` };
      }
    }

    // 超过90天未使用
    if (lastUsed) {
      const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
      if (days > this.config.unusedDays) {
        return { reason: `软规则: 超过${this.config.unusedDays}天未使用` };
      }
    }

    return null;
  }

  /**
   * 检查是否应直接删除（V2.1：需检查引用）
   */
  shouldDeleteDirect(file, referenced) {
    // 如果文件被引用，禁止删除
    if (referenced) {
      return false;
    }
    
    // 0字节文件且超过7天
    if (file.size === 0 && file.last_used_at) {
      const now = new Date();
      const lastUsed = new Date(file.last_used_at);
      const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
      return days > 7;
    }
    return false;
  }

  /**
   * 检查metadata是否可信（V2.1增强信任机制）
   */
  isMetadataTrusted(file) {
    // 可信来源优先级：
    // 1. 系统索引生成（source: 'index'）
    // 2. 系统hook/技能工具创建（source: 'system'）
    // 3. 包含完整系统字段且逻辑一致
    // 4. 来自保护路径的文件
    
    // 1. 系统索引生成
    if (file.source && file.source === 'index') {
      return true;
    }
    
    // 2. 系统工具创建
    if (file.source && ['system', 'hook', 'skill', 'tool'].includes(file.source)) {
      return true;
    }
    
    // 3. 保护路径内的文件（默认可信）
    const protectedPaths = [
      '/system/', '/core/', '/skills/', '/memory/', '/.learnings/',
      '/AGENTS.md', '/MEMORY.md', '/USER.md', '/SOUL.md', '/TOOLS.md', '/IDENTITY.md',
      '/HEARTBEAT.md', '/BOOTSTRAP.md'
    ];
    
    const filePath = file.path || '';
    if (protectedPaths.some(path => filePath.startsWith(path))) {
      return true;
    }
    
    // 4. 包含完整系统字段且逻辑一致
    if (file.last_used_at && file.created_at && file.updated_at) {
      try {
        const lastUsed = new Date(file.last_used_at);
        const created = new Date(file.created_at);
        const updated = new Date(file.updated_at);
        const now = new Date();
        
        // 检查日期逻辑：创建时间 <= 当前时间 && 更新时间 <= 当前时间 && 最后使用时间 <= 当前时间 && 创建时间 <= 更新时间
        // 修复：不再要求 updated <= lastUsed（文件更新后可能未被使用）
        if (created <= now && updated <= now && lastUsed <= now && created <= updated) {
          // 检查字段完整性
          if (file.size !== undefined && file.type && file.importance) {
            return true;
          }
        }
      } catch (e) {
        // 日期解析失败，不可信
      }
    }
    
    // 5. 文件有引用关系标记（被其他文件引用）
    if (file.referenced_by && file.referenced_by.length > 0) {
      return true;
    }
    
    // 其他情况视为不可信
    return false;
  }

  /**
   * 检查文件是否被引用（V2.1增强：内容扫描 + 索引检查）
   */
  isFileReferenced(filePath) {
    // 第一步：检查索引中的引用标记
    const file = this.manager.index.get(filePath);
    if (file && file.referenced_by && file.referenced_by.length > 0) {
      return true;
    }
    
    // 第二步：扫描文件内容中的引用（简化实现）
    // 获取目标文件的basename用于匹配
    const path = require('path');
    const targetBasename = path.basename(filePath);
    const targetNameWithoutExt = targetBasename.replace(/\.[^/.]+$/, '');
    
    // 常见引用模式正则表达式（增强版V2.1.4）
    const referencePatterns = [
      // import "filename" or import './filename' (单行/多行)
      /import\s+['"]([^'"]+)['"]/g,
      // import('filename') 动态导入
      /import\s*\(\s*['"]([^'"]+)['"]/g,
      // require("filename") or require('./filename')
      /require\s*\(\s*['"]([^'"]+)['"]/g,
      // require.resolve("filename")
      /require\.resolve\s*\(\s*['"]([^'"]+)['"]/g,
      // from "filename"
      /from\s+['"]([^'"]+)['"]/g,
      // Python: from module import something (相对导入)
      /from\s+['"]([^'"]+)['"]\s+import/g,
      // Python: import module
      /import\s+['"]([^'"]+)['"]/g,
      // #include "filename" (C/C++)
      /#include\s+["<]([^">]+)[">]/g,
      // load("filename") (Lua, Ruby等)
      /load\s*\(\s*['"]([^'"]+)['"]/g,
      // source("filename") (R, shell)
      /source\s*\(\s*['"]([^'"]+)['"]/g,
      // @import "filename" (CSS, Less, Sass)
      /@import\s+['"]([^'"]+)['"]/g,
      // require_relative "filename" (Ruby)
      /require_relative\s+['"]([^'"]+)['"]/g,
      // go: import "package"
      /import\s+['"]([^'"]+)['"]/g,
      // 多行导入（支持括号包裹的多个导入）
      /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g,
      /from\s+['"]([^'"]+)['"]\s+import\s*\(([^)]+)\)/g,
      // 配置文件中的路径引用（JSON, YAML, XML）
      /(?:path|file|dir|directory|include|require|src|source)\s*[:=]\s*['"]([^'"]+)['"]/gi
    ];
    
    const workspacePath = this.manager.workspacePath;
    const fs = require('fs');
    
    // 路径匹配辅助函数（V2.1.4增强）
    const isPathMatch = (referencedPath, targetPath) => {
      // 标准化路径：去除前后的./或./
      let normalizedRef = referencedPath.trim();
      if (normalizedRef.startsWith('./') || normalizedRef.startsWith('../')) {
        // 相对路径：需要结合源文件位置解析，这里简化处理
        normalizedRef = normalizedRef.replace(/^\.\//, '').replace(/^\.\.\//, '');
      }
      
      // 去除查询参数和哈希（如 filename.js?version=1）
      normalizedRef = normalizedRef.split('?')[0].split('#')[0];
      
      // 获取目标文件的基本信息
      const targetDir = path.dirname(targetPath);
      const targetName = path.basename(targetPath);
      const targetNameNoExt = path.basename(targetPath, path.extname(targetPath));
      
      // 检查精确匹配
      if (normalizedRef === targetPath || normalizedRef === targetName) {
        return true;
      }
      
      // 检查目录+文件名匹配（如 lib/utils.js 匹配 /lib/utils.js）
      if (normalizedRef.endsWith('/' + targetName) || normalizedRef.includes('/' + targetName + '?')) {
        return true;
      }
      
      // 检查无扩展名匹配（如 import './utils' 匹配 /utils.js）
      if (normalizedRef === targetNameNoExt || 
          normalizedRef.endsWith('/' + targetNameNoExt) ||
          normalizedRef === targetPath.replace(path.extname(targetPath), '')) {
        return true;
      }
      
      // 检查索引文件（如 import './dir' 匹配 /dir/index.js）
      if (targetName === 'index.js' || targetName === 'index.ts' || 
          targetName === '__init__.py') {
        const parentDir = path.dirname(targetPath);
        const dirName = path.basename(parentDir);
        if (normalizedRef === dirName || normalizedRef.endsWith('/' + dirName)) {
          return true;
        }
      }
      
      return false;
    };
    
    // 扫描所有文本文件（简化：扫描当前目录下的.js、.py、.md、.json文件）
    const scanExtensions = ['.js', '.py', '.md', '.json', '.ts', '.jsx', '.tsx', '.html', '.css'];
    
    try {
      // 获取workspace下所有文件
      const allFiles = this.manager.index.getAllFiles() || [];
      
      for (const otherFile of allFiles) {
        const otherPath = otherFile.path.startsWith('/') ? otherFile.path.substring(1) : otherFile.path;
        const fullOtherPath = path.join(workspacePath, otherPath);
        
        // 跳过非文本文件和大文件
        const ext = path.extname(otherPath).toLowerCase();
        if (!scanExtensions.includes(ext)) continue;
        
        try {
          const stats = fs.statSync(fullOtherPath);
          if (stats.size > 100000) continue; // 跳过大于100KB的文件
          
          const content = fs.readFileSync(fullOtherPath, 'utf8');
          
          // 检查每个引用模式
          for (const pattern of referencePatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              // 多模式正则可能捕获多个组，取第一个非空组
              let referencedPath = '';
              for (let i = 1; i < match.length; i++) {
                if (match[i] && match[i].trim()) {
                  referencedPath = match[i].trim();
                  break;
                }
              }
              
              if (!referencedPath) continue;
              
              // 使用增强路径匹配算法
              if (isPathMatch(referencedPath, filePath)) {
                console.log(`[引用检查] 找到引用: ${otherPath} → ${filePath} (${referencedPath})`);
                return true;
              }
            }
          }
        } catch (err) {
          // 跳过无法读取的文件
          continue;
        }
      }
    } catch (err) {
      // 扫描失败，回退到索引检查
      console.warn(`引用扫描失败: ${err.message}`);
    }
    
    // 默认返回false（未被引用）
    return false;
  }

  /**
   * 检查是否应使用LLM判断（V2.1明确边界）
   */
  shouldAskLLM(file, filePath, referenced) {
    // 禁止调用LLM的情况（V2.1严格边界）：
    // 1. 文件已被引用（最高优先级）
    if (referenced) {
      return false;
    }
    
    // 2. 在保护路径内
    if (this.isProtectedPath(filePath)) {
      return false;
    }
    
    // 3. 热文件（24小时内使用过）
    if (this.isHotFile(file)) {
      return false;
    }
    
    // 4. 强规则文件类型（明确类型）
    const strongTypes = ['.log', '.cache', '.tmp', '.temp', '.pyc', '.pyo', '.swp', '.swo', '~', '.bak', '.DS_Store', 'Thumbs.db'];
    if (strongTypes.some(type => filePath.endsWith(type))) {
      return false; // 强规则已覆盖，无需LLM
    }
    
    // 5. 大文件（>5MB）不调用LLM（成本/效益比低）
    const fs = require('fs');
    const fullPath = path.join(this.manager.workspacePath, filePath);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.size > 5000000) { // >5MB
        return false;
      }
    } catch (e) {
      // 无法获取大小，保守起见不调用LLM
      return false;
    }
    
    // 可以调用LLM的情况（严格限制）：
    // 1. 无扩展名文件
    const pathModule = require('path');
    const ext = pathModule.extname(filePath);
    if (!ext || ext === '') {
      return true;
    }
    
    // 2. metadata不可信 + 非明确类型 + 非保护路径
    if (!this.isMetadataTrusted(file)) {
      // 非明确类型：非强规则文件类型
      const ambiguousTypes = ['.txt', '.md', '.json', '.yml', '.yaml', '.xml', '.csv'];
      if (ambiguousTypes.some(type => filePath.endsWith(type))) {
        return true;
      }
    }
    
    // 3. 内容与类型明显冲突（例如.txt文件内容看起来像代码）
    // （在getContentSummary中检测，此处不处理）
    
    // 4. 重要性为low且超过90天未使用（低价值文件）
    if (file.importance === 'low' && file.last_used_at) {
      const now = new Date();
      const lastUsed = new Date(file.last_used_at);
      const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
      if (days > 90) {
        return true;
      }
    }
    
    // 默认不调用LLM（保守原则）
    return false;
  }

  /**
   * 批量LLM决策处理（优化性能）
   * @param {Array} files - 需要LLM判断的文件列表
   * @param {boolean} dryRun - 是否试运行
   * @param {object} result - 结果对象用于更新统计
   * @returns {Promise<object>} 处理结果
   */
  async batchLLMDecisions(files, dryRun, result) {
    if (!files || files.length === 0) {
      return { processed: 0, cleaned: 0 };
    }

    console.log(`[Cleanup] LLM批处理开始: ${files.length} 个文件`);

    // 准备批处理数据
    const llmRequests = [];
    for (const file of files) {
      try {
        const contentSummary = await this.getContentSummary(file.path, file.file);
        llmRequests.push({
          path: file.path,
          metadata: file.file,
          contentSummary,
          metadataTrusted: file.metadataTrusted,
          file
        });
      } catch (err) {
        // 如果无法读取内容，记录错误并跳过
        console.warn(`[Cleanup] 无法获取文件摘要 ${file.path}: ${err.message}`);
        result.skipped_files++;
        continue;
      }
    }

    // 调用LLM批处理
    const batchResult = await this.manager.llm.decideBatch(
      llmRequests.map(req => ({
        path: req.path,
        metadata: req.metadata,
        contentSummary: req.contentSummary
      })),
      { batchSize: this.batchSize, useCache: true }
    );

    // 处理决策结果
    let cleaned = 0;
    for (let i = 0; i < batchResult.results.length; i++) {
      const llmDecision = batchResult.results[i];
      const fileData = llmRequests[i];
      result.llm_decisions++;

      // V2.1决策收敛：LLM decision = trash 且 confidence ≥ 0.7 → 执行
      if (llmDecision.decision === 'trash' && (llmDecision.confidence || 0) >= 0.7) {
        if (!dryRun) {
          await this.manager.moveToTrash(fileData.path, llmDecision.reason, 'llm');
        }
        result.cleaned_files++;
        result.cleaned_size += fileData.metadata.size || 0;
        cleaned++;
        result.actions.push({
          path: fileData.path,
          action: 'move_to_trash',
          reason: llmDecision.reason,
          decision_by: 'llm',
          rule_stage: 'llm',
          reference_checked: true,
          metadata_trusted: fileData.metadataTrusted,
          file_importance: fileData.metadata.importance,
          confidence: llmDecision.confidence,
          cached: llmDecision.cached || false
        });
      } else {
        result.skipped_files++;
      }
    }

    console.log(`[Cleanup] LLM批处理完成: ${files.length} 个文件, ${cleaned} 个清理, ${batchResult.stats.cached} 缓存命中`);
    return { processed: files.length, cleaned };
  }

  /**
   * 获取文件内容摘要（V2.1支持大文件元信息）
   */
  async getContentSummary(filePath, file) {
    try {
      const fullPath = path.join(this.manager.workspacePath, filePath);
      const stats = fs.statSync(fullPath);
      const pathModule = require('path');

      // V2.1大文件规则：>1MB文件不读取内容，只提供元信息
      if (stats.size > 1000000) { // > 1MB
        return JSON.stringify({
          type: 'metadata_only',
          filename: pathModule.basename(filePath),
          extension: pathModule.extname(filePath),
          size: stats.size,
          path: filePath,
          last_modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          note: '文件超过1MB，未读取内容（V2.1安全规则）'
        });
      }

      if (stats.size > 10000) {
        // 中等文件只读前500字符
        const fd = fs.openSync(fullPath, 'r');
        const buffer = Buffer.alloc(500);
        fs.readSync(fd, buffer, 0, 500, 0);
        fs.closeSync(fd);
        return buffer.toString('utf8');
      } else {
        return fs.readFileSync(fullPath, 'utf8');
      }
    } catch (err) {
      return `[无法读取: ${err.message}]`;
    }
  }
}

module.exports = Cleanup;
