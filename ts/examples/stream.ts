/**
 * 示例：订阅事件流
 *
 * 运行: npx tsx examples/stream.ts [group-id]
 */

import { CCCCClient, DaemonUnavailableError, DaemonAPIError } from '../src/index.js';
import type { CCCSEvent } from '../src/index.js';

async function main() {
  const groupId = process.argv[2];

  if (!groupId) {
    console.log('用法: npx tsx examples/stream.ts <group-id>');
    console.log('');
    console.log('示例:');
    console.log('  npx tsx examples/stream.ts my-group');
    process.exit(1);
  }

  try {
    console.log('正在连接守护进程...');
    const client = await CCCCClient.create();

    console.log(`\n正在订阅组 "${groupId}" 的事件流...`);
    console.log('按 Ctrl+C 退出\n');

    for await (const item of client.eventsStream({ groupId })) {
      if (item.t === 'heartbeat') {
        console.log(`[心跳] ts=${item.ts}`);
      } else if (item.t === 'event') {
        const event = item.event as CCCSEvent;
        console.log(`[事件] ${event.kind} | id=${event.event_id}`);
        console.log(`  组: ${event.group_id}`);
        console.log(`  时间: ${event.ts}`);
        if (event.data) {
          console.log(`  数据: ${JSON.stringify(event.data)}`);
        }
        console.log('');
      }
    }

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('守护进程不可用:', error.message);
      console.error('请确保 ccccd 正在运行');
    } else if (error instanceof DaemonAPIError) {
      console.error('API 错误:', error.code, error.message);
      if (error.code === 'group_not_found') {
        console.error(`组 "${groupId}" 不存在`);
      }
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
