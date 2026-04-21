/**
 * File Classifier
 * 文件分类器 - 基于规则优先级分类文件
 */

const path = require('path');

class Classifier {
  constructor(manager) {
    this.manager = manager;
    
    // 根目录核心文件豁免清单
    this.protectedRootFiles = [
      'AGENTS.md', 'MEMORY.md', 'IDENTITY.md', 'USER.md',
      'SOUL.md', 'TOOLS.md', 'HEARTBEAT.md', 'BOOTSTRAP.md'
    ];
    
    this.rules = [
      // 优先级 0: 根目录核心文件豁免（最高优先级）
      {
        pattern: (filePath, content) => {
          const basename = path.basename(filePath);
          const dirname = path.dirname(filePath);
          // 根目录的核心文件豁免
          if (dirname === '.' || dirname === this.manager.workspacePath) {
            return this.protectedRootFiles.includes(basename);
          }
          return false;
        },
        target: null, // 不移动
        type: 'core',
        importance: 'high',
        priority: 0, // 最高优先级
        name: 'root_core_file_exempt'
      },
      
      // 优先级 0: 根目录隐藏文件豁免（但 task-summary 除外）
      {
        pattern: (filePath, content) => {
          const basename = path.basename(filePath);
          const dirname = path.dirname(filePath);
          // 根目录的隐藏文件豁免，但 task-summary 文件需要分类到 temp/logs
          if ((dirname === '.' || dirname === this.manager.workspacePath) && basename.startsWith('.')) {
            // 排除 task-summary 文件，这些需要分类到 temp/logs
            if (basename.includes('task-summary')) {
              return false;
            }
            return true;
          }
          return false;
        },
        target: null, // 不移动
        type: 'system',
        importance: 'high',
        priority: 0,
        name: 'root_hidden_file_exempt'
      },

      // 优先级 1: 强规则（日志、缓存、临时文件、任务摘要）
      {
        // task-summary 文件（Agent任务摘要）- 支持 .task-summary 和 task-summary 两种形式
        pattern: (filePath, content) => {
          const basename = path.basename(filePath);
          return basename.includes('task-summary');
        },
        target: '/temp/logs',
        type: 'log',
        importance: 'low',
        priority: 1,
        name: 'task_summary_file'
      },
      {
        pattern: /\.log$/i,
        target: '/temp/logs',
        type: 'log',
        importance: 'low',
        priority: 1,
        name: 'log_file'
      },
      {
        pattern: /\.cache$/i,
        target: '/temp/cache',
        type: 'cache',
        importance: 'low',
        priority: 1,
        name: 'cache_file'
      },
      {
        pattern: /\.tmp$/i,
        target: '/temp/pending',
        type: 'temp',
        importance: 'low',
        priority: 1,
        name: 'tmp_file'
      },
      {
        pattern: /\.temp$/i,
        target: '/temp/pending',
        type: 'temp',
        importance: 'low',
        priority: 1,
        name: 'temp_file'
      },

      // 优先级 2: 文档和配置（子目录文件原地保留）
      {
        pattern: /\.md$/i,
        target: null, // 原地保留
        type: 'document',
        importance: 'normal',
        priority: 2,
        name: 'markdown_file'
      },
      {
        pattern: /\.txt$/i,
        target: null, // 原地保留
        type: 'document',
        importance: 'normal',
        priority: 2,
        name: 'text_file'
      },
      {
        pattern: /\.json$/i,
        target: null, // 原地保留
        type: 'config',
        importance: 'high',
        priority: 2,
        name: 'json_file'
      },
      {
        pattern: /\.yaml$/i,
        target: null, // 原地保留
        type: 'config',
        importance: 'high',
        priority: 2,
        name: 'yaml_file'
      },
      {
        pattern: /\.yml$/i,
        target: '/core',
        type: 'config',
        importance: 'high',
        priority: 2,
        name: 'yml_file'
      },

      // 优先级 3: 技能文件
      {
        pattern: /skill\.json$/i,
        target: '/skills',
        type: 'skill',
        importance: 'high',
        priority: 3,
        name: 'skill_file'
      },
      {
        pattern: /^skill-/i,
        target: '/skills',
        type: 'skill',
        importance: 'high',
        priority: 3,
        name: 'skill_directory'
      },

      // 优先级 3: 代码文件
      {
        pattern: /\.js$/i,
        target: '/dependencies/libs',
        type: 'code',
        importance: 'normal',
        priority: 3,
        name: 'javascript_file'
      },
      {
        pattern: /\.py$/i,
        target: '/dependencies/libs',
        type: 'code',
        importance: 'normal',
        priority: 3,
        name: 'python_file'
      },
      {
        pattern: /\.ts$/i,
        target: '/dependencies/libs',
        type: 'code',
        importance: 'normal',
        priority: 3,
        name: 'typescript_file'
      },

      // 优先级 4: 内容匹配（仅限代码文件）
      {
        contentMatch: (filePath, content) => {
          if (!content) return false;
          
          // 仅限代码文件扩展名
          const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.php', '.rb', '.swift'];
          const ext = path.extname(filePath).toLowerCase();
          if (!codeExtensions.includes(ext)) {
            return false;
          }
          
          // 检查是否包含导入/依赖语句
          const importPattern = /(import|require|from|include|require_relative|using|package)/i;
          return importPattern.test(content);
        },
        target: '/dependencies/libs',
        type: 'dependency',
        importance: 'normal',
        priority: 4,
        name: 'dependency_file'
      }
    ];

    this.fallback = {
      target: '/temp/pending',
      type: 'pending',
      importance: 'low',
      priority: 99
    };
  }

  /**
   * 分类文件
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容（可选）
   * @returns {object} 分类结果
   */
  classify(filePath, content = null) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath);

    // 按优先级匹配规则
    const sortedRules = [...this.rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      let matched = false;

      // 支持 RegExp 和 Function 类型的 pattern
      if (rule.pattern) {
        if (typeof rule.pattern === 'function') {
          // 函数类型的 pattern
          matched = rule.pattern(filePath, content);
        } else if (rule.pattern.test) {
          // RegExp 类型的 pattern
          matched = rule.pattern.test(filename) || rule.pattern.test(filePath);
        }
      }

      // 内容匹配（需要提供内容）
      if (!matched && rule.contentMatch && content) {
        matched = rule.contentMatch.test(content);
      }

      if (matched) {
        // target=null 表示不移动文件
        const targetPath = rule.target 
          ? this.getTargetPath(rule.target, filename)
          : filePath; // 原地保留

        return {
          target_path: targetPath,
          type: rule.type,
          importance: rule.importance,
          rule_matched: rule.name,
          priority: rule.priority,
          moved: rule.target !== null // 是否会被移动
        };
      }
    }

    // fallback
    return {
      target_path: this.getTargetPath(this.fallback.target, filename),
      type: this.fallback.type,
      importance: this.fallback.importance,
      rule_matched: 'fallback',
      priority: this.fallback.priority,
      moved: true
    };
  }

  /**
   * 获取目标路径
   * @param {string} baseDir - 基础目录
   * @param {string} filename - 文件名
   */
  getTargetPath(baseDir, filename) {
    return `${baseDir}/${filename}`;
  }

  /**
   * 批量分类
   * @param {string[]} files - 文件路径数组
   */
  classifyBatch(files) {
    return files.map(f => ({
      original: f,
      ...this.classify(f)
    }));
  }

  /**
   * 添加自定义规则
   * @param {object} rule - 规则对象
   */
  addRule(rule) {
    this.rules.push({
      ...rule,
      priority: rule.priority || 50
    });
  }

  /**
   * 获取所有规则
   */
  getRules() {
    return [...this.rules].sort((a, b) => a.priority - b.priority);
  }
}

module.exports = Classifier;
