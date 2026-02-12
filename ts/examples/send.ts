/**
 * 示例：创建组并发送消息
 *
 * 运行: npx tsx examples/send.ts
 */

import { CCCCClient, DaemonUnavailableError, DaemonAPIError } from '../src/index.js';

async function main() {
  try {
    console.log('正在连接守护进程...');
    const client = await CCCCClient.create();

    // 创建组
    console.log('\n正在创建组...');
    const group = await client.groupCreate({ title: 'TS SDK 测试组' });
    const groupId = group['group_id'] as string;
    console.log('组已创建:', groupId);

    // 查看组详情
    console.log('\n正在获取组详情...');
    const groupInfo = await client.groupShow(groupId);
    console.log('组信息:', JSON.stringify(groupInfo, null, 2));

    // 添加 Actor
    console.log('\n正在添加 Actor...');
    const actor = await client.actorAdd({
      groupId,
      actorId: 'bot-1',
      title: 'Test Bot',
      runtime: 'external',
    });
    console.log('Actor 已添加:', actor);

    // 发送消息
    console.log('\n正在发送消息...');
    const sendResult = await client.send({
      groupId,
      text: 'Hello from TypeScript SDK!',
      by: 'user',
    });
    console.log('消息已发送:', sendResult);

    // 回复消息
    const eventId = ((sendResult['event'] as { id?: string } | undefined)?.id ?? '') as string;
    if (eventId) {
      console.log('\n正在回复消息...');
      const replyResult = await client.reply({
        groupId,
        replyTo: eventId,
        text: '这是一条回复',
        by: 'bot-1',
      });
      console.log('回复已发送:', replyResult);
    }

    // 列出所有组
    console.log('\n当前所有组:');
    const groups = await client.groups();
    console.log(JSON.stringify(groups, null, 2));

    // 清理：删除组
    console.log('\n正在删除测试组...');
    await client.groupDelete(groupId);
    console.log('组已删除');

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('守护进程不可用:', error.message);
      console.error('请确保 ccccd 正在运行');
    } else if (error instanceof DaemonAPIError) {
      console.error('API 错误:', error.code, error.message);
      console.error('详情:', error.details);
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
