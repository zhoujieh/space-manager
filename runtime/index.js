/**
 * Space Index Manager
 * 空间索引管理器 - 维护 space_index.json
 */

const fs = require('fs');
const path = require('path');

class Index {
  constructor(manager) {
    this.manager = manager;
    this.indexFile = '/system/space_index.json';
  }

  /**
   * 获取索引文件完整路径
   */
  getIndexPath() {
    return path.join(this.manager.workspacePath, this.indexFile);
  }

  /**
   * 读取索引
   */
  readIndex() {
    const indexPath = this.getIndexPath();

    if (!fs.existsSync(indexPath)) {
      // 创建默认索引
      const defaultIndex = { files: [] };
      fs.writeFileSync(indexPath, JSON.stringify(defaultIndex, null, 2));
      return defaultIndex;
    }

    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  /**
   * 写入索引
   * @param {object} index - 索引对象
   */
  writeIndex(index) {
    const indexPath = this.getIndexPath();

    // 确保目录存在
    const dir = path.dirname(indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * 扫描索引
   * @param {object} filters - 过滤条件
   */
  async scan(filters = {}) {
    let index = this.readIndex();
    let files = index.files || [];

    // 应用过滤条件
    if (filters.type) {
      files = files.filter(f => f.type === filters.type);
    }
    if (filters.importance) {
      files = files.filter(f => f.importance === filters.importance);
    }
    if (filters.owner) {
      files = files.filter(f => f.owner === filters.owner);
    }
    if (filters.unused_days) {
      const now = new Date();
      files = files.filter(f => {
        if (!f.last_used_at) return true;
        const lastUsed = new Date(f.last_used_at);
        const days = (now - lastUsed) / (1000 * 60 * 60 * 24);
        return days > filters.unused_days;
      });
    }

    // 计算统计信息
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    return {
      total_files: files.length,
      total_size: totalSize,
      files
    };
  }

  /**
   * 添加或更新文件记录
   * @param {object} fileInfo - 文件信息
   */
  async addOrUpdate(fileInfo) {
    let index = this.readIndex();
    const existingIndex = index.files.findIndex(f => f.path === fileInfo.path);

    if (existingIndex >= 0) {
      // 更新现有记录
      index.files[existingIndex] = {
        ...index.files[existingIndex],
        ...fileInfo,
        last_used_at: new Date().toISOString()
      };
    } else {
      // 添加新记录
      index.files.push({
        ...fileInfo,
        created_at: fileInfo.created_at || new Date().toISOString(),
        last_used_at: new Date().toISOString()
      });
    }

    this.writeIndex(index);
    return fileInfo;
  }

  /**
   * 移除文件记录
   * @param {string} filePath - 文件路径
   */
  async remove(filePath) {
    let index = this.readIndex();
    const initialLength = index.files.length;

    index.files = index.files.filter(f => f.path !== filePath);

    this.writeIndex(index);

    return {
      removed: index.files.length < initialLength,
      path: filePath
    };
  }

  /**
   * 获取单个文件信息
   * @param {string} filePath - 文件路径
   */
  get(filePath) {
    const index = this.readIndex();
    return index.files.find(f => f.path === filePath) || null;
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   */
  exists(filePath) {
    const index = this.readIndex();
    return index.files.some(f => f.path === filePath);
  }

  /**
   * 重建索引（扫描实际文件）
   */
  async rebuild() {
    const workspacePath = this.manager.workspacePath;
    const files = [];

    const scanDir = (dir, basePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relativePath = path.join(basePath, item.name);

        if (item.isDirectory()) {
          // 跳过隐藏目录和特殊目录
          if (!item.name.startsWith('.') && item.name !== 'node_modules') {
            scanDir(fullPath, relativePath);
          }
        } else if (item.isFile()) {
          const stats = fs.statSync(fullPath);
          files.push({
            path: '/' + relativePath,
            type: this.detectType(item.name),
            importance: 'normal',
            owner: 'agent',
            created_at: stats.birthtime.toISOString(),
            last_used_at: stats.mtime.toISOString(),
            size: stats.size
          });
        }
      }
    };

    scanDir(workspacePath);

    const index = { files };
    this.writeIndex(index);

    return {
      rebuilt: true,
      total_files: files.length,
      total_size: files.reduce((sum, f) => sum + f.size, 0)
    };
  }

  /**
   * 检测文件类型
   * @param {string} filename - 文件名
   */
  detectType(filename) {
    const ext = path.extname(filename).toLowerCase();

    const typeMap = {
      '.md': 'document',
      '.txt': 'document',
      '.json': 'config',
      '.yaml': 'config',
      '.yml': 'config',
      '.js': 'code',
      '.ts': 'code',
      '.py': 'code',
      '.log': 'log',
      '.cache': 'cache',
      '.tmp': 'temp',
      '.temp': 'temp'
    };

    return typeMap[ext] || 'unknown';
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const index = this.readIndex();
    const files = index.files || [];

    const stats = {
      total_files: files.length,
      total_size: files.reduce((sum, f) => sum + (f.size || 0), 0),
      by_type: {},
      by_importance: {},
      by_owner: {}
    };

    for (const file of files) {
      // 按类型统计
      stats.by_type[file.type] = (stats.by_type[file.type] || 0) + 1;

      // 按重要性统计
      stats.by_importance[file.importance] = (stats.by_importance[file.importance] || 0) + 1;

      // 按所有者统计
      stats.by_owner[file.owner] = (stats.by_owner[file.owner] || 0) + 1;
    }

    return stats;
  }

  /**
   * 检查索引与文件系统的一致性（V2.1新增）
   * @returns {object} 一致性检查结果
   */
  async checkConsistency() {
    const index = this.readIndex();
    const workspacePath = this.manager.workspacePath;
    const fs = require('fs');
    const path = require('path');
    
    const missingInFs = []; // 索引中有但文件系统中不存在
    const missingInIndex = []; // 文件系统中存在但索引中没有
    const mismatchedSize = []; // 大小不匹配
    
    // 检查索引中的每个文件
    for (const file of index.files) {
      const fullPath = path.join(workspacePath, file.path.startsWith('/') ? file.path.substring(1) : file.path);
      
      if (!fs.existsSync(fullPath)) {
        missingInFs.push({
          path: file.path,
          reason: '文件系统中不存在'
        });
      } else {
        // 检查大小是否匹配
        const stats = fs.statSync(fullPath);
        if (file.size !== undefined && file.size !== stats.size) {
          mismatchedSize.push({
            path: file.path,
            index_size: file.size,
            fs_size: stats.size,
            diff: Math.abs(file.size - stats.size)
          });
        }
      }
    }
    
    // 标记索引为dirty（如果发现不一致）
    const hasInconsistencies = missingInFs.length > 0 || missingInIndex.length > 0 || mismatchedSize.length > 0;
    if (hasInconsistencies) {
      index.dirty = true;
      index.dirty_reason = 'checkConsistency_found_inconsistencies';
      index.dirty_at = new Date().toISOString();
      this.writeIndex(index);
    }
    
    return {
      consistent: !hasInconsistencies,
      dirty: hasInconsistencies,
      missing_in_fs: missingInFs,
      missing_in_index: missingInIndex,
      mismatched_size: mismatchedSize,
      total_indexed: index.files.length
    };
  }

  /**
   * 获取索引状态
   */
  getStatus() {
    const index = this.readIndex();
    return {
      total_files: index.files ? index.files.length : 0,
      dirty: index.dirty || false,
      dirty_reason: index.dirty_reason || null,
      dirty_at: index.dirty_at || null,
      last_checked: new Date().toISOString()
    };
  }
}

module.exports = Index;
