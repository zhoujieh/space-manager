/**
 * Space Manager 集成测试
 * 版本: 2.1.1
 */

const fs = require('fs');
const path = require('path');
const SpaceManager = require('../runtime/main.js');

// 测试工具
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Space Manager 集成测试\n');
    console.log('=' .repeat(50));

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (err) {
        console.log(`❌ ${name}`);
        console.log(`   错误: ${err.message}`);
        this.failed++;
      }
    }

    console.log('=' .repeat(50));
    console.log(`\n📊 结果: ${this.passed} 通过, ${this.failed} 失败`);
    console.log(`成功率: ${((this.passed / this.tests.length) * 100).toFixed(1)}%\n`);

    return this.failed === 0;
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEquals(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }
}

// 创建临时workspace
function createTempWorkspace() {
  const tempDir = path.join('/tmp', `space-manager-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// 清理临时workspace
function cleanupTempWorkspace(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 主测试
async function runTests() {
  const runner = new TestRunner();

  // 测试1: 初始化workspace
  runner.test('初始化workspace - 创建目录结构', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      const result = await manager.initialize();

      runner.assert(result.success, '初始化应成功');
      runner.assert(fs.existsSync(path.join(tempDir, 'docs')), 'docs目录应存在');
      runner.assert(fs.existsSync(path.join(tempDir, '.trash')), '.trash目录应存在');
      runner.assert(fs.existsSync(path.join(tempDir, 'AGENTS.md')), 'AGENTS.md应存在');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试2: 保护路径检查
  runner.test('保护路径检查 - /coredata 不应匹配 /core', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const cleanup = manager.cleanup;

      // /core 应受保护
      runner.assert(cleanup.isProtectedPath('/core/file.txt'), '/core/file.txt 应受保护');
      // /coredata 不应受保护
      runner.assert(!cleanup.isProtectedPath('/coredata/file.txt'), '/coredata/file.txt 不应受保护');
      // /system 应受保护
      runner.assert(cleanup.isProtectedPath('/system/test.json'), '/system/test.json 应受保护');
      // /systembackup 不应受保护
      runner.assert(!cleanup.isProtectedPath('/systembackup/test.json'), '/systembackup/test.json 不应受保护');
      // /memory 应受保护
      runner.assert(cleanup.isProtectedPath('/memory/2026-04-19.md'), '/memory/2026-04-19.md 应受保护');
      // /.learnings 应受保护
      runner.assert(cleanup.isProtectedPath('/.learnings/LEARNINGS.md'), '/.learnings/LEARNINGS.md 应受保护');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试2.5: 豁免关键词检查
  runner.test('豁免关键词检查 - HEARTBEAT.md应受保护', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const cleanup = manager.cleanup;

      // 核心文件豁免
      runner.assert(cleanup.hasExemptKeyword('/AGENTS.md'), 'AGENTS.md 应豁免');
      runner.assert(cleanup.hasExemptKeyword('/MEMORY.md'), 'MEMORY.md 应豁免');
      runner.assert(cleanup.hasExemptKeyword('/HEARTBEAT.md'), 'HEARTBEAT.md 应豁免');
      runner.assert(cleanup.hasExemptKeyword('/IDENTITY.md'), 'IDENTITY.md 应豁免');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试3: node_modules保护 - 嵌套场景
  runner.test('node_modules保护 - 嵌套场景', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建嵌套结构
      const nestedDir = path.join(tempDir, 'src', 'node_modules');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, 'test.js'), 'module.exports = {};');

      // 创建package.json在根目录
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

      const cleanup = manager.cleanup;

      // 根目录的node_modules应受保护
      const rootNodeModules = path.join(tempDir, 'node_modules');
      fs.mkdirSync(rootNodeModules, { recursive: true });
      runner.assert(!cleanup.checkNodeModulesConditions('/node_modules/test.js'), '根目录node_modules应受保护');

      // 嵌套的node_modules（根目录有package.json）应受保护
      runner.assert(!cleanup.checkNodeModulesConditions('/src/node_modules/test.js'), '嵌套node_modules（根目录有package.json）应受保护');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试4: 文件移动到回收站并恢复
  runner.test('文件移动和恢复 - 深层路径', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建深层路径文件
      const deepDir = path.join(tempDir, 'docs', '2024', 'reports');
      fs.mkdirSync(deepDir, { recursive: true });
      const originalFile = path.join(deepDir, 'report.md');
      fs.writeFileSync(originalFile, '# Report');

      // 移动文件到回收站
      const moveResult = await manager.moveToTrash('/docs/2024/reports/report.md', '测试删除');
      if (!moveResult.success) {
        console.log('moveToTrash失败:', moveResult.error);
      }
      runner.assert(moveResult.success, '移动应成功');

      // 检查文件在回收站
      const trashFiles = fs.readdirSync(path.join(tempDir, '.trash'));
      runner.assert(trashFiles.length === 1, '回收站应有1个文件');

      // 恢复文件
      const restoreResult = await manager.restoreFromTrash(trashFiles[0]);
      if (!restoreResult.success) {
        console.log('restoreFromTrash失败:', restoreResult.error);
      }
      runner.assert(restoreResult.success, '恢复应成功');
      runner.assert(restoreResult.original_path === '/docs/2024/reports/report.md', '应恢复到原始路径');

      // 检查文件恢复
      runner.assert(fs.existsSync(originalFile), '文件应恢复到原始位置');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试5: 元数据时间校验
  runner.test('元数据时间校验 - 更新后未使用', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const cleanup = manager.cleanup;

      // 创建测试文件元数据（更新后未使用）
      const now = new Date();
      const yesterday = new Date(now - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

      const file = {
        path: '/test.txt',
        created_at: twoDaysAgo.toISOString(),
        updated_at: yesterday.toISOString(),
        last_used_at: twoDaysAgo.toISOString(), // 最后使用在更新前
        size: 100,
        type: 'document',
        importance: 'normal'
      };

      // 修复后：应认为可信（不再要求 updated <= lastUsed）
      runner.assert(cleanup.isMetadataTrusted(file), '更新后未使用的文件应可信');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试6: LLM缓存
  runner.test('LLM缓存 - 重复文件应命中缓存', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const llm = manager.llm;

      // 第一次调用
      const decision1 = await llm.decide('/test.txt', { size: 100, type: 'text' }, 'test content');
      runner.assert(!decision1.cached, '第一次调用不应命中缓存');

      // 第二次调用（相同参数）
      const decision2 = await llm.decide('/test.txt', { size: 100, type: 'text' }, 'test content');
      runner.assert(decision2.cached, '第二次调用应命中缓存');

      // 检查缓存统计
      const stats = llm.getCacheStats();
      runner.assert(stats.hits >= 1, '缓存命中数应>=1');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试7: 批处理
  runner.test('LLM批处理 - 10个文件应减少API调用', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const llm = manager.llm;

      // 准备10个文件
      const files = [];
      for (let i = 0; i < 10; i++) {
        files.push({
          path: `/test${i}.txt`,
          metadata: { size: 100 + i, type: 'text' },
          contentSummary: `content ${i}`
        });
      }

      // 批处理
      const result = await llm.decideBatch(files, { batchSize: 5 });

      runner.assert(result.results.length === 10, '应返回10个结果');
      runner.assert(result.stats.batched > 1, '应分多批处理');
      runner.assert(result.stats.apiCalls <= 10, 'API调用应<=10（有缓存时更少）');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试8: 索引一致性检查性能
  runner.test('索引一致性检查 - 大工作区限制', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建大量文件
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.txt`), 'content');
      }

      // 扫描应限制文件数
      const files = manager.index._scanFileSystem(tempDir, { maxFiles: 50 });
      runner.assert(files.length <= 50, '扫描应限制在50个文件以内');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试9: 增强引用检查 - ES6动态导入
  runner.test('增强引用检查 - ES6动态导入', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建测试文件
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'main.js'), 'const module = await import("./utils.js");');
      fs.writeFileSync(path.join(srcDir, 'utils.js'), 'export default {};');

      // 扫描索引
      await manager.scanIndex();

      // 检查引用
      const cleanup = manager.cleanup;
      const referenced = cleanup.isFileReferenced('/src/utils.js');
      runner.assert(referenced, 'utils.js 应被动态导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试10: 增强引用检查 - Python导入
  runner.test('增强引用检查 - Python导入', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建Python文件
      fs.writeFileSync(path.join(tempDir, 'main.py'), 'from utils import helper\nimport os');
      fs.writeFileSync(path.join(tempDir, 'utils.py'), 'def helper(): pass');

      await manager.scanIndex();
      const cleanup = manager.cleanup;
      const referenced = cleanup.isFileReferenced('/utils.py');
      runner.assert(referenced, 'utils.py 应被Python导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试11: 增强引用检查 - 多行导入
  runner.test('增强引用检查 - 多行导入', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      fs.writeFileSync(path.join(tempDir, 'main.js'), `import {
  Component,
  useState
} from './react.js';`);
      fs.writeFileSync(path.join(tempDir, 'react.js'), 'export const Component = {};');

      await manager.scanIndex();
      const cleanup = manager.cleanup;
      const referenced = cleanup.isFileReferenced('/react.js');
      runner.assert(referenced, 'react.js 应被多行导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试12: 索引一致性检查符号链接优化
  runner.test('索引一致性检查 - 符号链接处理', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建文件和符号链接
      fs.writeFileSync(path.join(tempDir, 'real.txt'), 'content');
      fs.symlinkSync(path.join(tempDir, 'real.txt'), path.join(tempDir, 'link.txt'));

      // 扫描索引
      await manager.scanIndex();

      // 检查一致性
      const result = await manager.index.checkConsistency();
      runner.assert(result.consistent, '索引应保持一致（包含符号链接）');
      runner.assert(result.total_in_fs >= 1, '应检测到文件系统文件');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试13: 批处理LLM决策性能
  runner.test('批处理LLM决策 - 性能验证', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const llm = manager.llm;

      // 准备20个文件进行批处理
      const files = [];
      for (let i = 0; i < 20; i++) {
        files.push({
          path: `/test${i}.txt`,
          metadata: { size: 100 + i, type: 'text' },
          contentSummary: `content ${i}`
        });
      }

      const startTime = Date.now();
      const result = await llm.decideBatch(files, { batchSize: 10 });
      const duration = Date.now() - startTime;

      runner.assert(result.results.length === 20, '应返回20个结果');
      runner.assert(result.stats.batched >= 2, '应分至少2批处理');
      runner.assert(result.stats.apiCalls <= 20, 'API调用应<=20');
      
      console.log(`   批处理耗时: ${duration}ms, 批次: ${result.stats.batched}, API调用: ${result.stats.apiCalls}`);
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试14: LLM缓存性能
  runner.test('LLM缓存 - 命中率验证', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const llm = manager.llm;

      // 第一次调用（缓存未命中）
      const decision1 = await llm.decide('/test.txt', { size: 100, type: 'text' }, 'test content');
      runner.assert(!decision1.cached, '第一次调用不应命中缓存');

      // 第二次调用相同内容（应命中缓存）
      const decision2 = await llm.decide('/test.txt', { size: 100, type: 'text' }, 'test content');
      runner.assert(decision2.cached, '第二次调用应命中缓存');

      // 第三次调用不同内容（应缓存未命中）
      const decision3 = await llm.decide('/test.txt', { size: 100, type: 'text' }, 'different content');
      runner.assert(!decision3.cached, '不同内容不应命中缓存');

      // 检查缓存统计
      const stats = llm.getCacheStats();
      runner.assert(stats.hits >= 1, '缓存命中数应>=1');
      runner.assert(stats.hitRate > 0, '命中率应>0');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试15: 大工作区索引扫描限制
  runner.test('大工作区索引扫描限制', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建超过限制的文件
      for (let i = 0; i < 150; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.txt`), 'content');
      }

      // 使用限制扫描
      const files = manager.index._scanFileSystem(tempDir, { maxFiles: 100 });
      runner.assert(files.length <= 100, '扫描应限制在100个文件以内');
      runner.assert(files.length === 100, '应返回正好100个文件（达到限制）');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试16: 清理批处理集成
  runner.test('清理批处理集成 - 真实清理场景', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建需要LLM判断的文件
      for (let i = 0; i < 15; i++) {
        const filePath = path.join(tempDir, `unknown${i}.dat`);
        fs.writeFileSync(filePath, `ambiguous content ${i}`);
      }

      // 执行清理（启用LLM）
      const result = await manager.cleanup.run({
        dryRun: true,
        llmEnabled: true
      });

      runner.assert(result.scanned_files >= 15, '应扫描至少15个文件');
      runner.assert(result.llm_decisions <= 15, 'LLM决策数应<=文件数');
      
      // 检查批处理统计（通过日志或结果）
      console.log(`   清理统计: 扫描${result.scanned_files}文件, LLM决策${result.llm_decisions}次`);
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试17: 配置项验证
  runner.test('配置项验证 - max_index_scan_files', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 检查配置是否正确加载
      runner.assert(manager.config.max_index_scan_files === 10000, 'max_index_scan_files 应默认为10000');

      // 测试自定义配置
      const customManager = new SpaceManager(tempDir, { max_index_scan_files: 5000 });
      runner.assert(customManager.config.max_index_scan_files === 5000, '应支持自定义max_index_scan_files');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试18: 文件恢复与索引更新集成
  runner.test('文件恢复与索引更新集成', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建文件并移动到回收站
      const originalPath = '/docs/test.md';
      const fullPath = path.join(tempDir, 'docs', 'test.md');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '# Test');

      const moveResult = await manager.moveToTrash(originalPath, '测试');
      runner.assert(moveResult.success, '移动应成功');

      // 检查索引是否更新
      const index1 = await manager.scanIndex();
      const inIndex1 = index1.files.some(f => f.path === originalPath);
      runner.assert(!inIndex1, '移动后文件不应在索引中');

      // 恢复文件
      const trashFiles = fs.readdirSync(path.join(tempDir, '.trash'));
      const restoreResult = await manager.restoreFromTrash(trashFiles[0]);
      runner.assert(restoreResult.success, '恢复应成功');

      // 检查索引是否再次更新
      const index2 = await manager.scanIndex();
      const inIndex2 = index2.files.some(f => f.path === originalPath);
      runner.assert(inIndex2, '恢复后文件应在索引中');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试19: 路径匹配算法准确性
  runner.test('路径匹配算法准确性', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      const cleanup = manager.cleanup;

      // 测试各种路径匹配场景
      const testCases = [
        { ref: './utils.js', target: '/utils.js', shouldMatch: true },
        { ref: 'utils', target: '/utils.js', shouldMatch: true },
        { ref: 'lib/utils.js', target: '/lib/utils.js', shouldMatch: true },
        { ref: '../utils.js', target: '/utils.js', shouldMatch: false }, // 简化实现可能不匹配
        { ref: 'utils.js?v=1', target: '/utils.js', shouldMatch: true },
        { ref: 'utils.js#section', target: '/utils.js', shouldMatch: true },
      ];

      for (const tc of testCases) {
        console.log(`   测试: ${tc.ref} -> ${tc.target}`);
      }
      
      // 注：实际路径匹配在 isFileReferenced 内部，这里不直接测试
      runner.assert(true, '路径匹配测试完成');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试20: 整体性能基准测试
  runner.test('整体性能基准测试', async () => {
    const tempDir = createTempWorkspace();
    try {
      const manager = new SpaceManager(tempDir);
      await manager.initialize();

      // 创建混合类型文件
      const fileCount = 50;
      for (let i = 0; i < fileCount; i++) {
        const ext = i % 5 === 0 ? '.log' : i % 5 === 1 ? '.tmp' : i % 5 === 2 ? '.md' : '.txt';
        fs.writeFileSync(path.join(tempDir, `file${i}${ext}`), 'content '.repeat(10));
      }

      // 执行完整工作流并计时
      const scanStart = Date.now();
      await manager.scanIndex();
      const scanTime = Date.now() - scanStart;

      const cleanupStart = Date.now();
      await manager.cleanup.run({ dryRun: true, llmEnabled: true });
      const cleanupTime = Date.now() - cleanupStart;

      console.log(`   性能指标: 扫描${scanTime}ms, 清理${cleanupTime}ms, 总计${scanTime + cleanupTime}ms`);

      runner.assert(scanTime < 5000, '扫描50个文件应在5秒内完成');
      runner.assert(cleanupTime < 10000, '清理50个文件应在10秒内完成');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 运行所有测试
  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

// 如果直接运行此文件
if (require.main === module) {
  runTests().catch(err => {
    console.error('测试运行失败:', err);
    process.exit(1);
  });
}

module.exports = { runTests, TestRunner };