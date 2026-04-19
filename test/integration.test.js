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