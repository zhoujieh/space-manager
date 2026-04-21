/**
 * Cleanup 模块单元测试
 * 版本: V2.1.5 - Bug Fix: init后索引为空导致误清理
 */

const fs = require('fs');
const path = require('path');

// 模拟 SpaceManager
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
    this.index = {
      get: () => null,
      getAllFiles: () => []
    };
  }
}

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
    console.log('
🧪 Cleanup 单元测试 - 引用检查增强
');
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
    console.log(`
📊 结果: ${this.passed} 通过, ${this.failed} 失败`);
    console.log(`成功率: ${((this.passed / this.tests.length) * 100).toFixed(1)}%
`);

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

  assertArrayIncludes(array, item, message) {
    if (!array.includes(item)) {
      throw new Error(message || `Array does not include ${item}`);
    }
  }
}

// 创建临时workspace
function createTempWorkspace() {
  const tempDir = path.join('/tmp', `cleanup-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// 清理临时workspace
function cleanupTempWorkspace(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 主测试函数
async function runTests() {
  const runner = new TestRunner();

  // 测试1: ES6 导入检测
  runner.test('ES6 导入检测 - import 语句', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      // 创建测试文件
      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, 'import "./utils.js";
import "../lib/math.js";');

      // 创建被引用的文件
      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(utilsFile, 'export default {};');

      // 模拟索引
      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];

      // 检查引用
      const referenced = cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced, 'utils.js 应被 test.js 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试2: ES6 动态导入
  runner.test('ES6 动态导入 - import()', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, 'const module = await import("./dynamic.js");');

      const dynamicFile = path.join(tempDir, 'dynamic.js');
      fs.writeFileSync(dynamicFile, 'export default {};');

      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/dynamic.js', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/dynamic.js');
      runner.assert(referenced, 'dynamic.js 应被动态导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试3: CommonJS require
  runner.test('CommonJS require 检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, 'const fs = require("fs");
const utils = require("./utils");');

      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(utilsFile, 'module.exports = {};');

      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced, 'utils.js 应被 require 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试4: require.resolve 检测
  runner.test('require.resolve 检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, 'const path = require.resolve("./config.json");');

      const configFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(configFile, '{}');

      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/config.json', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/config.json');
      runner.assert(referenced, 'config.json 应被 require.resolve 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试5: Python from...import
  runner.test('Python from...import 检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.py');
      fs.writeFileSync(testFile, 'from utils import helper
from ..lib import math');

      const utilsFile = path.join(tempDir, 'utils.py');
      fs.writeFileSync(utilsFile, 'def helper(): pass');

      manager.index.getAllFiles = () => [
        { path: '/test.py', size: 100 },
        { path: '/utils.py', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/utils.py');
      runner.assert(referenced, 'utils.py 应被 Python from...import 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试6: Python import 语句
  runner.test('Python import 语句检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.py');
      fs.writeFileSync(testFile, 'import os
import utils');

      const utilsFile = path.join(tempDir, 'utils.py');
      fs.writeFileSync(utilsFile, 'def helper(): pass');

      manager.index.getAllFiles = () => [
        { path: '/test.py', size: 100 },
        { path: '/utils.py', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/utils.py');
      runner.assert(referenced, 'utils.py 应被 Python import 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试7: C++ #include
  runner.test('C++ #include 检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.cpp');
      fs.writeFileSync(testFile, '#include "utils.h"
#include <vector>');

      const utilsFile = path.join(tempDir, 'utils.h');
      fs.writeFileSync(utilsFile, '#pragma once');

      manager.index.getAllFiles = () => [
        { path: '/test.cpp', size: 100 },
        { path: '/utils.h', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/utils.h');
      runner.assert(referenced, 'utils.h 应被 #include 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试8: CSS @import
  runner.test('CSS @import 检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'style.css');
      fs.writeFileSync(testFile, '@import "variables.css";
@import url("theme.css");');

      const variablesFile = path.join(tempDir, 'variables.css');
      fs.writeFileSync(variablesFile, ':root { --color: red; }');

      manager.index.getAllFiles = () => [
        { path: '/style.css', size: 100 },
        { path: '/variables.css', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/variables.css');
      runner.assert(referenced, 'variables.css 应被 @import 引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试9: 多行导入检测
  runner.test('ES6 多行导入检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, `import {
  Component,
  useState,
  useEffect
} from './react.js';`);

      const reactFile = path.join(tempDir, 'react.js');
      fs.writeFileSync(reactFile, 'export const Component = {};');

      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/react.js', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/react.js');
      runner.assert(referenced, 'react.js 应被多行导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试10: 配置文件路径引用
  runner.test('配置文件路径引用检测', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(testFile, JSON.stringify({
        "path": "./data.json",
        "src": "src/main.js",
        "include": ["lib/*.js"]
      }, null, 2));

      const dataFile = path.join(tempDir, 'data.json');
      fs.writeFileSync(dataFile, '{}');

      manager.index.getAllFiles = () => [
        { path: '/config.json', size: 100 },
        { path: '/data.json', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/data.json');
      runner.assert(referenced, 'data.json 应被配置文件引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试11: 精确路径匹配（无扩展名）
  runner.test('无扩展名路径精确匹配', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      const testFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(testFile, 'import "./utils";');  // 无扩展名

      const utilsFile = path.join(tempDir, 'utils.js');
      fs.writeFileSync(utilsFile, 'export default {};');

      manager.index.getAllFiles = () => [
        { path: '/test.js', size: 100 },
        { path: '/utils.js', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/utils.js');
      runner.assert(referenced, 'utils.js 应被无扩展名导入引用');
    } finally {
      cleanupTempWorkspace(tempDir);
    }
  });

  // 测试12: 相对路径匹配
  runner.test('相对路径匹配', async () => {
    const tempDir = createTempWorkspace();
    try {
      const Cleanup = require('../runtime/cleanup.js');
      const manager = new MockSpaceManager(tempDir);
      const cleanup = new Cleanup(manager);

      // 创建目录结构
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      const testFile = path.join(srcDir, 'test.js');
      fs.writeFileSync(testFile, 'import "../lib/utils.js";');

      const libDir = path.join(tempDir, 'lib');
      fs.mkdirSync(libDir, { recursive: true });
      
      const utilsFile = path.join(libDir, 'utils.js');
      fs.writeFileSync(utilsFile, 'export default {};');

      manager.index.getAllFiles = () => [
        { path: '/src/test.js', size: 100 },
        { path: '/lib/utils.js', size: 100 }
      ];

      const referenced = cleanup.isFileReferenced('/lib/utils.js');
      runner.assert(referenced, '../lib/utils.js 应被相对路径引用匹配');
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
    console.error('单元测试运行失败:', err);
    process.exit(1);
  });
}

module.exports = { runTests, TestRunner };
