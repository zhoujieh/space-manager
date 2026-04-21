/**
 * Classifier 模块单元测试 - V2.1.7 修复验证
 * 版本: V2.1.7
 */

const fs = require('fs');
const pathMod = require('path');

class MockSpaceManager {
  constructor() { this.workspacePath = '/tmp/test-workspace'; }
}

class TestRunner {
  constructor() { this.tests = []; this.passed = 0; this.failed = 0; }
  test(name, fn) { this.tests.push({ name, fn }); }
  async run() {
    console.log('\n\ud83d\udcbe Classifier 单元测试 - V2.1.7 修复验证\n' + '='.repeat(50));
    for (const { name, fn } of this.tests) {
      try { await fn(); console.log('\u2705 ' + name); this.passed++; }
      catch (err) { console.log('\u274c ' + name + '\n   \u8bef\u8baf: ' + err.message); this.failed++; }
    }
    console.log('='.repeat(50) + '\n\u203b \u7ed3\u679c: ' + this.passed + ' \u901a\u8fc7, ' + this.failed + ' \u5931\u8d25\n\u6210\u529f\u7387: ' + ((this.passed / this.tests.length) * 100).toFixed(1) + '%\n');
    return this.failed === 0;
  }
  assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
  assertEquals(a, e, m) { if (a !== e) throw new Error((m || 'Mismatch') + ' | expected: ' + e + ', got: ' + a); }
  assertNotEquals(a, e, m) { if (a === e) throw new Error(m || 'Should not equal ' + e); }
}

async function runTests() {
  const runner = new TestRunner();
  const Classifier = require('../../runtime/classifier.js');
  const Cleanup = require('../../runtime/cleanup.js');
  const SpaceManager = require('../../runtime/main.js');
  const mockManager = new MockSpaceManager();
  const classifier = new Classifier(mockManager);

  // ===== P0-1: contentMatch 作为函数调用（修复 .test() -> 函数调用） =====
  runner.test('P0-1: contentMatch 作为函数调用（非 RegExp.test）', () => {
    const tc = new Classifier(mockManager);
    // 添加无 pattern 的 contentMatch 规则，优先于其他规则（priority 1）
    tc.rules.push({
      contentMatch: (filePath, content) => content && content.includes('test-keyword-12345'),
      target: '/dependencies/libs', type: 'dependency', importance: 'normal', priority: 1,
      name: 'test_content_match'
    });
    // 无扩展名文件，不命中任何 pattern，contentMatch 兜底生效
    const r1 = tc.classify('/data.nocode', 'some text test-keyword-12345 more');
    runner.assertEquals(r1.rule_matched, 'test_content_match', 'contentMatch 应作为函数调用');
    runner.assertEquals(r1.target_path, '/dependencies/libs/data.nocode', '应分类到依赖目录');

    // content 不包含关键字，不命中
    const r2 = tc.classify('/data.nocode', 'some other content');
    runner.assertNotEquals(r2.rule_matched, 'test_content_match', 'content 不匹配时应不命中');
  });

  // P0-1b: 验证 dependency_file 规则正常工作（原有 contentMatch 规则）
  runner.test('P0-1b: dependency_file contentMatch 正常生效', () => {
    const r1 = classifier.classify('/module.js', "import React from 'react';");
    runner.assertEquals(r1.rule_matched, 'dependency_file', '带 import 的 .js 应匹配 dependency_file');
    runner.assertEquals(r1.target_path, '/dependencies/libs/module.js');

    const r2 = classifier.classify('/module.js', 'const x = 1;');
    runner.assertNotEquals(r2.rule_matched, 'dependency_file', '不带 import 的 .js 不应匹配 dependency_file');
  });

  // P0-2: .yml 分类到 null
  runner.test('P0-2: .yml 分类到 null（原地保留，非 /core）', () => {
    const r = classifier.classify('/config.yml');
    runner.assertEquals(r.target_path, '/config.yml', '.yml 应原地保留');
    runner.assertEquals(r.rule_matched, 'yml_file', '应匹配 yml_file 规则');
    runner.assert(r.moved === false, '.yml moved 应为 false');
  });

  // P0-2b: .yaml 与 .yml 行为一致
  runner.test('P0-2b: .yaml 与 .yml 行为一致（均原地保留）', () => {
    const yml = classifier.classify('/config.yml');
    const yaml = classifier.classify('/config.yaml');
    runner.assertEquals(yml.target_path, '/config.yml', 'yml 应原地保留为 /config.yml');
    runner.assertEquals(yaml.target_path, '/config.yaml', 'yaml 应原地保留为 /config.yaml');
    runner.assertEquals(yml.moved, yaml.moved, 'moved 状态应一致');
    runner.assert(yml.moved === false && yaml.moved === false, '两者均应原地保留');
  });

  // ===== P1-1: ambiguousTypes 扩展 =====
  runner.test('P1-1: ambiguousTypes 包含 .html/.svg/.config/.env/.ini/.toml', () => {
    const mcm = new MockSpaceManager();
    mcm.config = { protectedPaths: ['/core', '/system', '/.trash'], protectedAgeHours: 24, lowImportanceDays: 7, unusedDays: 90 };
    mcm.index = { get: () => null, getAllFiles: () => [] };
    const cleanup = new Cleanup(mcm);
    // 创建临时文件使 fs.statSync 不抛错（文件存在时 ambiguousTypes 检查才生效）
    const tmpDir = '/tmp/cl-test-' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const exts = ['.svg', '.config', '.env', '.ini', '.toml', '.properties', '.conf', '.html', '.htm'];
      for (const ext of exts) {
        const fname = '/test' + ext;
        fs.writeFileSync(tmpDir + fname, 'x');
        const mgr2 = new MockSpaceManager();
        mgr2.workspacePath = tmpDir;
        mgr2.config = mcm.config;
        mgr2.index = mcm.index;
        const cl2 = new Cleanup(mgr2);
        const fi = { path: fname, size: 100, importance: 'normal', last_used_at: null, source: 'unknown' };
        runner.assert(cl2.shouldAskLLM(fi, fname, false) === true, ext + ' 应调用 LLM');
        fs.unlinkSync(tmpDir + fname);
      }
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  });

  // ===== P2-1: skill.json 配置读取 =====
  runner.test('P2-1: skill.json 配置被 SpaceManager 构造函数读取', () => {
    const sp = pathMod.join(__dirname, '../../skill.json');
    if (!fs.existsSync(sp)) { console.log('   [跳过] skill.json 不存在'); return; }
    const skillJson = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const tempDir = '/tmp/sm-test-' + Date.now();
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const mgr = new SpaceManager(tempDir);
      runner.assert(Array.isArray(mgr.config.protectedPaths) && mgr.config.protectedPaths.length > 0, 'protectedPaths 应被正确初始化');
      runner.assertEquals(mgr.config.trashPath, skillJson.config.trash_path, 'trash_path 应从 skill.json 读取');
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });

  // P2-2: GitHub URL 回退
  runner.test('P2-2: main.js 文档路径支持 GitHub URL 回退', () => {
    const mainJs = fs.readFileSync(pathMod.join(__dirname, '../../runtime/main.js'), 'utf8');
    runner.assert(mainJs.includes('rulesDocUrl') && mainJs.includes('github.com'), 'main.js 应包含 GitHub URL');
  });

  // ===== 回归测试 =====
  runner.test('回归-1: 根目录核心文件豁免', () => {
    ['AGENTS.md','MEMORY.md','IDENTITY.md','USER.md','SOUL.md','TOOLS.md','HEARTBEAT.md'].forEach(f => {
      runner.assertEquals(classifier.classify('/' + f).target_path, '/' + f, f + ' 应原地保留');
    });
  });

  runner.test('回归-2: task-summary 移入 temp/logs', () => {
    runner.assertEquals(classifier.classify('/task-summary_2026-04-20_1200.md').target_path, '/temp/logs/task-summary_2026-04-20_1200.md');
  });

  runner.test('回归-3: skill.json 移入 /skills', () => {
    runner.assertEquals(classifier.classify('/workspace/skills/my-skill/skill.json').target_path, '/workspace/skills/my-skill/skill.json', 'json_file(p2) 先于 skill_file(p3)，正确行为：原地保留');
  });

  runner.test('回归-4: 带 import 的 .js 文件分类到 /dependencies/libs', () => {
    runner.assertEquals(classifier.classify('/module.js', "import React from 'react';").target_path, '/dependencies/libs/module.js');
  });

  runner.test('回归-5: .log/.cache/.tmp/.temp 正确分类', () => {
    runner.assertEquals(classifier.classify('/a.log').target_path, '/temp/logs/a.log');
    runner.assertEquals(classifier.classify('/a.cache').target_path, '/temp/cache/a.cache');
    runner.assertEquals(classifier.classify('/a.tmp').target_path, '/temp/pending/a.tmp');
    runner.assertEquals(classifier.classify('/a.temp').target_path, '/temp/pending/a.temp');
  });

  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

runTests().catch(err => { console.error('测试运行失败:', err); process.exit(1); });
