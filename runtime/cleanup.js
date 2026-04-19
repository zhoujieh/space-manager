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
      'AGENTS', 'MEMORY', 'USER', 'SOUL', 'TOOLS', 'IDENTITY',
      'secret', 'password', 'token', 'key', 'credential', 'private',
      'backup', 'database', 'config'
    ];
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

        // 检查删除规则（0字节文件）
        if (this.shouldDeleteDirect(file, referenced)) {
          if (!dryRun) {
            const fullPath = path.join(this.manager.workspacePath, file.path);
            fs.unlinkSync(fullPath);
            await this.manager.index.remove(file.path);
          }
          result.cleaned_files++;
          result.actions.push({
            path: file.path,
            action: 'delete_direct',
            reason: '0字节文件超过7天',
            decision_by: 'rule',
            rule_stage: 'direct_delete',
            reference_checked: true,
            metadata_trusted: metadataTrusted,
            file_importance: file.importance
          });
          continue;
        }

        // LLM判断（V2.1明确边界）
        if (llmEnabled && this.shouldAskLLM(file, file.path, referenced)) {
          const contentSummary = await this.getContentSummary(file.path, file);
          const decision = await this.manager.llmDecideFile(file.path, file, contentSummary);
          result.llm_decisions++;

          // V2.1决策收敛：LLM decision = trash 且 confidence ≥ 0.6 → 执行
          if (decision.decision === 'trash' && (decision.confidence || 0) >= 0.6) {
            if (!dryRun) {
              await this.manager.moveToTrash(file.path, decision.reason, 'llm');
            }
            result.cleaned_files++;
            result.cleaned_size += file.size || 0;
            result.actions.push({
              path: file.path,
              action: 'move_to_trash',
              reason: decision.reason,
              decision_by: 'llm',
              rule_stage: 'llm',
              reference_checked: true,
              metadata_trusted: metadataTrusted,
              file_importance: file.importance,
              confidence: decision.confidence
            });
          } else {
            result.skipped_files++;
          }
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
   */
  isProtectedPath(filePath) {
    for (const protectedPath of this.config.protectedPaths) {
      if (filePath.startsWith(protectedPath)) {
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
   */
  checkNodeModulesConditions(filePath) {
    const fs = require('fs');
    const path = require('path');
    const workspacePath = this.manager.workspacePath;
    
    // 1. 路径必须在workspace根目录
    const fullPath = path.join(workspacePath, filePath);
    const workspaceRoot = path.dirname(fullPath);
    if (workspaceRoot !== workspacePath) {
      return false; // 不在根目录，不允许清理
    }
    
    // 2. 同级是否存在package.json
    const parentDir = path.dirname(fullPath);
    const packageJsonPath = path.join(parentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return false; // 存在package.json，不允许清理
    }
    
    // 3. 是否存在lock文件
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    for (const lockFile of lockFiles) {
      const lockFilePath = path.join(parentDir, lockFile);
      if (fs.existsSync(lockFilePath)) {
        return false; // 存在lock文件，不允许清理
      }
    }
    
    // 4. 检查是否被引用（需要索引支持）
    // TODO: 实现引用检查
    // 暂时返回true，假设未被引用
    
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
   * 检查metadata是否可信（仅系统生成的metadata可信）
   */
  isMetadataTrusted(file) {
    // 系统生成的metadata来源：space_index.json，系统自动更新字段
    // 不可信来源：用户写入，文件内声明，缺失字段
    
    // 检查是否来自索引系统
    if (file.source && file.source === 'index') {
      return true;
    }
    
    // 检查是否包含系统自动更新的字段
    if (file.last_used_at && file.created_at) {
      // 简单检查：如果last_used_at在created_at之后，且格式正确
      try {
        const lastUsed = new Date(file.last_used_at);
        const created = new Date(file.created_at);
        if (lastUsed >= created && lastUsed <= new Date()) {
          return true;
        }
      } catch (e) {
        // 日期解析失败，不可信
      }
    }
    
    // 其他情况视为不可信
    return false;
  }

  /**
   * 检查文件是否被引用
   */
  isFileReferenced(filePath) {
    // TODO: 实现引用检查
    // 简单实现：检查是否在索引中被标记为依赖
    const file = this.manager.index.get(filePath);
    if (file && file.referenced_by && file.referenced_by.length > 0) {
      return true;
    }
    
    // 默认返回false（未被引用）
    return false;
  }

  /**
   * 检查是否应使用LLM判断（V2.1明确边界）
   */
  shouldAskLLM(file, filePath, referenced) {
    // 禁止调用LLM的情况：
    // 1. 强规则已明确（由调用者检查）
    // 2. 文件已被引用
    if (referenced) {
      return false;
    }
    
    // 3. 在保护路径内（由调用者检查）
    
    // 可以调用LLM的情况：
    // 1. 无扩展名文件
    const path = require('path');
    const ext = path.extname(filePath);
    if (!ext || ext === '') {
      return true;
    }
    
    // 2. fallback（未命中任何规则）- 由调用者判断
    // 3. metadata不可信 + 非明确类型
    if (!this.isMetadataTrusted(file)) {
      // 非明确类型：非强规则文件类型
      const strongTypes = ['.log', '.cache', '.tmp', '.temp', '.pyc', '.pyo', '.swp', '.swo', '~', '.bak'];
      if (!strongTypes.some(type => filePath.endsWith(type))) {
        return true;
      }
    }
    
    // 4. 内容与类型冲突（需要在getContentSummary中检测）
    
    // 默认不调用LLM
    return false;
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
