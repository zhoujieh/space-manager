/**
 * LLM Decision Module
 * LLM判断模块 - 用于边界文件的清理决策
 */

const fs = require('fs');
const path = require('path');

class LLM {
  constructor(manager) {
    this.manager = manager;
    this.decisionHistory = [];
    this.confidenceThreshold = 0.6;
  }

  /**
   * 判断文件是否应保留或删除
   * @param {string} filePath - 文件路径
   * @param {object} metadata - 文件元数据
   * @param {string} contentSummary - 文件内容摘要
   */
  async decide(filePath, metadata = {}, contentSummary = '') {
    // 构建决策上下文
    const context = this.buildContext(filePath, metadata, contentSummary);

    // 在实际应用中，这里会调用 LLM API
    // 这里先用规则模拟 LLM 决策
    const decision = this.simulateDecision(context);

    // 记录决策历史
    this.decisionHistory.push({
      timestamp: new Date().toISOString(),
      path: filePath,
      decision: decision.decision,
      reason: decision.reason,
      confidence: decision.confidence
    });

    return decision;
  }

  /**
   * 构建决策上下文（V2.1支持结构化元信息）
   */
  buildContext(filePath, metadata, contentSummary) {
    const filename = path.basename(filePath);
    const ext = path.extname(filename);
    
    // 处理contentSummary（可能是JSON字符串或普通文本）
    let contentSummaryProcessed = '';
    let metadataOnly = false;
    
    if (contentSummary && contentSummary.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(contentSummary);
        if (parsed.type === 'metadata_only') {
          metadataOnly = true;
          contentSummaryProcessed = JSON.stringify(parsed);
        } else {
          contentSummaryProcessed = contentSummary.substring(0, 500);
        }
      } catch (e) {
        contentSummaryProcessed = contentSummary.substring(0, 500);
      }
    } else {
      contentSummaryProcessed = contentSummary ? contentSummary.substring(0, 500) : '';
    }

    return {
      path: filePath,
      filename,
      extension: ext,
      metadata,
      contentSummary: contentSummaryProcessed,
      metadataOnly,
      type: metadata.type || 'unknown',
      importance: metadata.importance || 'normal',
      owner: metadata.owner || 'agent',
      size: metadata.size || 0,
      age_days: this.calculateAge(metadata.created_at),
      unused_days: this.calculateAge(metadata.last_used_at)
    };
  }

  /**
   * 计算文件年龄（天数）
   */
  calculateAge(timestamp) {
    if (!timestamp) return 0;
    const date = new Date(timestamp);
    const now = new Date();
    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
  }

  /**
   * 模拟 LLM 决策（实际应用中替换为真实 LLM 调用）
   */
  simulateDecision(context) {
    // V2.1: 处理metadataOnly情况（大文件无内容）
    if (context.metadataOnly) {
      // 仅基于元信息判断
      const ext = context.extension.toLowerCase();
      const strongTrashExts = ['.log', '.cache', '.tmp', '.temp', '.pyc', '.pyo', '.swp', '.swo', '.bak'];
      const strongKeepExts = ['.md', '.json', '.yaml', '.yml', '.js', '.py', '.ts', '.java'];
      
      if (strongTrashExts.includes(ext)) {
        return {
          decision: 'trash',
          reason: `大文件(${ext})，基于扩展名判断为可清理`,
          confidence: 0.7
        };
      }
      
      if (strongKeepExts.includes(ext)) {
        return {
          decision: 'keep',
          reason: `大文件(${ext})，基于扩展名判断为应保留`,
          confidence: 0.7
        };
      }
      
      // 未知扩展名的大文件
      return {
        decision: 'unsure',
        reason: `大文件(无内容访问权限)，扩展名${ext}未知，建议保留`,
        confidence: 0.3,
        note: 'V2.1大文件安全规则：未读取内容'
      };
    }
    
    // 基于扩展名的快速判断
    const extDecisions = {
      '.log': { decision: 'trash', reason: '日志文件，通常可清理', confidence: 0.95 },
      '.cache': { decision: 'trash', reason: '缓存文件，可安全清理', confidence: 0.95 },
      '.tmp': { decision: 'trash', reason: '临时文件，应该清理', confidence: 0.9 },
      '.temp': { decision: 'trash', reason: '临时文件，应该清理', confidence: 0.9 },
      '.md': { decision: 'keep', reason: '文档文件，应该保留', confidence: 0.85 },
      '.json': { decision: 'keep', reason: '配置文件，应该保留', confidence: 0.8 },
      '.js': { decision: 'keep', reason: '代码文件，需要评估', confidence: 0.7 },
      '.py': { decision: 'keep', reason: '代码文件，需要评估', confidence: 0.7 }
    };

    const ext = context.extension.toLowerCase();
    if (extDecisions[ext]) {
      return extDecisions[ext];
    }

    // 基于重要性的判断
    if (context.importance === 'high') {
      return {
        decision: 'keep',
        reason: '高重要性文件，应该保留',
        confidence: 0.9
      };
    }

    // 基于使用频率的判断
    if (context.unused_days > 90) {
      return {
        decision: 'trash',
        reason: `超过90天未使用(${context.unused_days}天)`,
        confidence: 0.7
      };
    }

    if (context.unused_days > 30) {
      return {
        decision: 'unsure',
        reason: `超过30天未使用(${context.unused_days}天)，需要人工确认`,
        confidence: 0.5
      };
    }

    // 基于内容的判断
    if (context.contentSummary) {
      const content = context.contentSummary.toLowerCase();

      // 检查是否包含敏感信息
      const sensitivePatterns = ['password', 'secret', 'token', 'key', 'credential'];
      for (const pattern of sensitivePatterns) {
        if (content.includes(pattern)) {
          return {
            decision: 'keep',
            reason: `可能包含敏感信息(${pattern})`,
            confidence: 0.8
          };
        }
      }

      // 检查是否为导入语句
      const importPatterns = ['import ', 'require(', 'from ', 'include<'];
      for (const pattern of importPatterns) {
        if (content.includes(pattern)) {
          return {
            decision: 'keep',
            reason: '包含依赖导入，可能是代码文件',
            confidence: 0.7
          };
        }
      }
    }

    // 默认：不确定
    return {
      decision: 'unsure',
      reason: '无法确定，建议保留',
      confidence: 0.4,
      suggested_importance: 'normal'
    };
  }

  /**
   * 调用真实 LLM API（可选实现）
   * @param {string} prompt - 提示词
   */
  async callLLMApi(prompt) {
    // 实际应用中替换为真实 API 调用
    // 例如:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    //   body: JSON.stringify({
    //     model: 'gpt-4',
    //     messages: [{ role: 'user', content: prompt }],
    //     temperature: 0.3
    //   })
    // });
    // return response.json();

    throw new Error('LLM API not implemented. Use simulateDecision instead.');
  }

  /**
   * 获取决策历史
   */
  getHistory() {
    return [...this.decisionHistory];
  }

  /**
   * 清空决策历史
   */
  clearHistory() {
    this.decisionHistory = [];
  }

  /**
   * 导出决策历史（用于审计）
   */
  exportHistory() {
    return JSON.stringify(this.decisionHistory, null, 2);
  }

  /**
   * 批量判断
   * @param {array} files - 文件列表
   */
  async decideBatch(files) {
    const results = [];

    for (const file of files) {
      const decision = await this.decide(file.path, file.metadata, file.contentSummary);
      results.push({
        ...file,
        ...decision
      });
    }

    return results;
  }

  /**
   * 设置置信度阈值
   */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}

module.exports = LLM;
