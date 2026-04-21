/**
 * Cleanup 模块单元测试 - V2.1.7 修复验证
 * 版本: V2.1.7
 */

const fs = require('fs');
const path = require('path');

class MockSpaceManager {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.config = {
      protectedPaths: ['/core', '/system', '/.trash', '/skills', '/.git', '/memory', '/.learnings'],
      protectedAgeHours: 24,
      lowImportanceDays: 7,
      unusedDays: 90,
      llmDecisionThreshold: 0.7
    };
    this.index = { get: () => null, getAllFiles: () => [] };
  }
}

class TestRunner {
  constructor() { this.tests = []; this.passed = 0; this.failed = 0; }
  test(name, fn) { this.tests.push({ name, fn }); }
  async run() {
    console.log('\n\ud83d\udcbe Cleanup 单元测试 - V2.1.7 引用检查增强\n' + '='.repeat(50));
    for (const { name, fn } of this.tests) {
      try { await fn(); console.log('\u2705 ' + name); this.passed++; }
      catch (err) { console.log('\u274c ' + name + '\n   \u8bef\u8baf: ' + err.message); this.failed++; }
    }
    console.log('='.repeat(50) + '\n\u203b \u7ed3\u679c: ' + this.passed + ' \u901a\u8fc7, ' + this.failed + ' \u5931\u8d25\n\u6210\u529f\u7387: ' + ((this.passed / this.tests.length) * 100).toFixed(1) + '%\n');
    return this.failed === 0;
  }
  assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
  assertEquals(a, e, m) { if (a !== e) throw new Error((m || 'Mismatch') + ' | expected: ' + e + ', got: ' + a); }
}

function createTempWorkspace() {
  const tempDir = path.join('/tmp', 'cleanup-test-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempWorkspace(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runTests() {
  const runner = new TestRunner();

  // ============ P4: referencePatterns 无 g 标志修复验证 ============
  runner.test('P4-1: ES6 import 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(testFile, 'import "./utils.js";\nimport "../lib/math.js";');
      fs.writeFileSync(utilsFile, 'export default {};');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced === true, 'utils.js 应被 test.js 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-2: ES6 动态导入 import()', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const dynamicFile = path.join(tempDir, 'dynamic.js');
      fs.writeFileSync(testFile, 'const module = await import("./dynamic.js");');
      fs.writeFileSync(dynamicFile, 'export default {};');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/dynamic.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/dynamic.js');
      runner.assert(referenced === true, 'dynamic.js 应被动态导入引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-3: CommonJS require 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(testFile, 'const fs = require("fs");\nconst utils = require("./utils");');
      fs.writeFileSync(utilsFile, 'module.exports = {};');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced === true, 'utils.js 应被 require 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-4: require.resolve 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const configFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(testFile, 'const path = require.resolve("./config.json");');
      fs.writeFileSync(configFile, '{}');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/config.json', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/config.json');
      runner.assert(referenced === true, 'config.json 应被 require.resolve 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-5: Python from...import 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.py');
      const utilsFile = path.join(tempDir, 'utils.py');
      fs.writeFileSync(testFile, 'from utils import helper\nfrom ..lib import math');
      fs.writeFileSync(utilsFile, 'def helper(): pass');
      manager.index.getAllFiles = () => [
        { path: '/test.py', size: 100 },
        { path: '/utils.py', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.py');
      runner.assert(referenced === true, 'utils.py 应被 Python from...import 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-6: Python import 语句检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.py');
      const utilsFile = path.join(tempDir, 'utils.py');
      fs.writeFileSync(testFile, 'import os\nimport utils');
      fs.writeFileSync(utilsFile, 'def helper(): pass');
      manager.index.getAllFiles = () => [
        { path: '/test.py', size: 100 },
        { path: '/utils.py', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.py');
      runner.assert(referenced === true, 'utils.py 应被 Python import 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-7: C++ #include 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.cpp');
      const utilsFile = path.join(tempDir, 'utils.h');
      fs.writeFileSync(testFile, '#include "utils.h"\n#include <vector>');
      fs.writeFileSync(utilsFile, '#pragma once');
      manager.index.getAllFiles = () => [
        { path: '/test.cpp', size: 100 },
        { path: '/utils.h', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.h');
      runner.assert(referenced === true, 'utils.h 应被 #include 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-8: CSS @import 检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'style.css');
      const variablesFile = path.join(tempDir, 'variables.css');
      fs.writeFileSync(testFile, '@import "variables.css";\n@import url("theme.css");');
      fs.writeFileSync(variablesFile, ':root { --color: red; }');
      manager.index.getAllFiles = () => [
        { path: '/style.css', size: 100 },
        { path: '/variables.css', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/variables.css');
      runner.assert(referenced === true, 'variables.css 应被 @import 引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-9: 多行 ES6 导入检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const reactFile = path.join(tempDir, 'react.js');
      fs.writeFileSync(testFile, 'import {\n  Component,\n  useState,\n  useEffect\n} from "./react.js";');
      fs.writeFileSync(reactFile, 'export const Component = {};');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/react.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/react.js');
      runner.assert(referenced === true, 'react.js 应被多行导入引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-10: 配置文件路径引用检测', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'config.json');
      const dataFile = path.join(tempDir, 'data.json');
      const content = JSON.stringify({
        "path": "./data.json",
        "src": "src/main.js",
        "include": ["lib/*.js"]
      }, null, 2);
      fs.writeFileSync(testFile, content);
      fs.writeFileSync(dataFile, '{}');
      manager.index.getAllFiles = () => [
        { path: '/config.json', size: 100 },
        { path: '/data.json', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/data.json');
      runner.assert(referenced === true, 'data.json 应被配置文件引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-11: 无扩展名路径精确匹配', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const testFile = path.join(tempDir, 'test.js');
      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(testFile, 'import "./utils";');
      fs.writeFileSync(utilsFile, 'export default {};');
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced === true, 'utils.js 应被无扩展名导入引用');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  runner.test('P4-12: 相对路径匹配', async () => {
    const Cleanup = require('../../runtime/cleanup.js');
    const tempDir = createTempWorkspace();
    try {
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'test.js');
      const libDir = path.join(tempDir, 'lib');
      fs.mkdirSync(libDir, { recursive: true });
      const utilsFile = path.join(libDir, 'utils.js');
      fs.writeFileSync(testFile, 'import "../lib/utils.js";');
      fs.writeFileSync(utilsFile, 'export default {};');
      manager.index.getAllFiles = () => [
        { path: '/src/test.js', size: 100 },
        { path: '/lib/utils.js', size: 100 }
      ];
      const referenced = await cleanup.isFileReferenced('/lib/utils.js');
      runner.assert(referenced === true, '../lib/utils.js 应被相对路径引用匹配');
    } finally { cleanupTempWorkspace(tempDir); }
  });

  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  runTests().catch(err => { console.error('单元测试运行失败:', err); process.exit(1); });
}

module.exports = { runTests, TestRunner };
