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
    this.confidenceThreshold = 0.7;
    
    // 缓存系统
    this.cache = new Map();
    this.cacheMaxSize = 1000;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    
    // 批处理配置
    this.batchSize = 10;
    this.batchDelay = 100; // ms
  }

  /**
   * 生成缓存键
   * @private
   */
  _generateCacheKey(filePath, metadata, contentSummary) {
    const crypto = require('crypto');
    // 稳定的缓存键：忽略时间戳等可变字段
    const keyData = JSON.stringify({
      path: filePath,
      size: metadata.size || 0,
      type: metadata.type || 'unknown',
      // 不包含时间戳，因为它们可能变化
      contentHash: contentSummary ? crypto.createHash('md5').update(contentSummary.substring(0, 200)).digest('hex') : ''
    });
    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  /**
   * 从缓存获取决策
   * @private
   */
  _getFromCache(cacheKey) {
    if (this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey);
      // 检查缓存是否过期（24小时）
      if (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
        this.cacheHits++;
        return entry.decision;
      }
      // 过期，删除
      this.cache.delete(cacheKey);
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * 保存决策到缓存
   * @private
   */
  _saveToCache(cacheKey, decision) {
    // LRU：如果缓存满了，删除最旧的条目
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(cacheKey, {
      decision: { ...decision },
      timestamp: Date.now()
    });
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? (this.cacheHits / total).toFixed(2) : 0
    };
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * 判断文件是否应保留或删除
   * @param {string} filePath - 文件路径
   * @param {object} metadata - 文件元数据
   * @param {string} contentSummary - 文件内容摘要
   * @param {object} options - 选项
   * @param {boolean} options.useCache - 是否使用缓存（默认true）
   */
  async decide(filePath, metadata = {}, contentSummary = '', options = {}) {
    const useCache = options.useCache !== false;
    
    // 尝试从缓存获取
    if (useCache) {
      const cacheKey = this._generateCacheKey(filePath, metadata, contentSummary);
      const cachedDecision = this._getFromCache(cacheKey);
      if (cachedDecision) {
        // 记录决策历史（标记为缓存命中）
        this.decisionHistory.push({
          timestamp: new Date().toISOString(),
          path: filePath,
          decision: cachedDecision.decision,
          reason: cachedDecision.reason + ' (cached)',
          confidence: cachedDecision.confidence,
          cached: true
        });
        // 返回带缓存标记的决策副本
        return { ...cachedDecision, cached: true };
      }
    }

    // 构建决策上下文
    const context = this.buildContext(filePath, metadata, contentSummary);

    // 在实际应用中，这里会调用 LLM API
    // 这里先用规则模拟 LLM 决策
    const decision = this.simulateDecision(context);

    // 保存到缓存
    if (useCache) {
      const cacheKey = this._generateCacheKey(filePath, metadata, contentSummary);
      this._saveToCache(cacheKey, decision);
    }

    // 记录决策历史
    this.decisionHistory.push({
      timestamp: new Date().toISOString(),
      path: filePath,
      decision: decision.decision,
      reason: decision.reason,
      confidence: decision.confidence,
      cached: false
    });

    // 返回带缓存标记的决策
    return { ...decision, cached: false };
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
   * 批量判断（优化版：支持批处理和缓存）
   * @param {array} files - 文件列表
   * @param {object} options - 选项
   * @param {number} options.batchSize - 批处理大小（默认10）
   * @param {boolean} options.useCache - 是否使用缓存（默认true）
   */
  async decideBatch(files, options = {}) {
    const batchSize = options.batchSize || this.batchSize;
    const useCache = options.useCache !== false;
    const results = [];
    
    // 统计信息
    const stats = {
      total: files.length,
      processed: 0,
      cached: 0,
      batched: 0,
      apiCalls: 0
    };

    // 分批处理
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = [];
      
      // 处理批次中的每个文件
      for (const file of batch) {
        // 检查缓存
        let decision;
        let fromCache = false;
        
        if (useCache) {
          const cacheKey = this._generateCacheKey(file.path, file.metadata, file.contentSummary);
          const cached = this._getFromCache(cacheKey);
          if (cached) {
            decision = cached;
            fromCache = true;
            stats.cached++;
          }
        }
        
        // 缓存未命中，调用decide
        if (!decision) {
          decision = await this.decide(file.path, file.metadata, file.contentSummary, { useCache: false });
          stats.apiCalls++;
          
          // 保存到缓存
          if (useCache) {
            const cacheKey = this._generateCacheKey(file.path, file.metadata, file.contentSummary);
            this._saveToCache(cacheKey, decision);
          }
        }
        
        batchResults.push({
          ...file,
          ...decision,
          _fromCache: fromCache
        });
      }
      
      results.push(...batchResults);
      stats.processed += batch.length;
      stats.batched++;
      
      // 批次间延迟，避免限流
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelay));
      }
    }
    
    console.log(`[LLM] 批处理完成: ${stats.total} 个文件, ${stats.batched} 批次, ${stats.cached} 缓存命中, ${stats.apiCalls} 次API调用`);
    
    return {
      results,
      stats
    };
  }

  /**
   * 设置置信度阈值
   */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}

module.exports = LLM;
