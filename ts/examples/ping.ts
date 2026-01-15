/**
 * 示例：Ping 守护进程
 *
 * 运行: npx tsx examples/ping.ts
 */

import { CCCCClient, DaemonUnavailableError } from '../src/index.js';

async function main() {
  try {
    console.log('正在连接守护进程...');
    const client = await CCCCClient.create();
    console.log('端点:', client.endpoint);

    console.log('\n正在 ping 守护进程...');
    const info = await client.ping();
    console.log('守护进程信息:');
    console.log('  - IPC 版本:', info['ipc_v']);
    console.log('  - 进程 ID:', info['pid']);
    console.log('  - 启动时间:', info['started_at']);
    console.log('  - 能力:', info['capabilities']);

    // 兼容性检查
    console.log('\n正在检查兼容性...');
    await client.assertCompatible({ requireIpcV: 1 });
    console.log('兼容性检查通过!');

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('守护进程不可用:', error.message);
      console.error('请确保 ccccd 正在运行');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
