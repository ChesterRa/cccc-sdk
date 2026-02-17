# CCCC SDK 0.4.x — CCCC 官方客户端 SDK

[English](README.md) | **中文** | [日本語](README.ja.md)

> 状态：**已稳定支持 CCCC 0.4.x**。同时保留 RC 构建用于预览测试。

CCCC SDK 是一套用于 CCCC 平台的**客户端 SDK**。

## 与 CCCC 本体的关系

- CCCC 本体仓库：https://github.com/ChesterRa/cccc
- `cccc`（本体）负责 daemon/web/CLI，以及 `CCCC_HOME` 下的运行时状态。
- `cccc-sdk`（本仓库）提供 Python/TypeScript 客户端，调用 **Daemon IPC v1**。
- SDK 不是独立框架，必须连接到已运行的 CCCC daemon。

只要 SDK 与 CCCC Web 指向同一个 `CCCC_HOME`，写入会立即互通
（消息、ACK、context 操作、automation 配置等）。

## 本仓库包含

- `python/` — Python 包（PyPI 名称 `cccc-sdk`，import 名称 `cccc_sdk`）
- `ts/` — TypeScript 包（`cccc-sdk`）
- `spec/` — SDK 开发使用的合约文档镜像

典型场景：
- 需要实时更新的 Web/IDE 插件（`events_stream`）
- 监听工作组并自动响应的 bot/service
- 以编程方式创建/管理 group、actors、共享 context 的内部工具

语言细分文档：
- Python SDK：`python/README.md`
- TypeScript SDK：`ts/README.md`

---

## 快速开始（Python）

1) 启动 CCCC（daemon + web）：

```bash
cccc
```

2) 安装 SDK（稳定版）：

```bash
pip install -U cccc-sdk

# RC 通道（可选，通常先发 TestPyPI）
pip install -U --pre --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk
```

3) 兼容性检查（推荐先跑一次）：

```bash
python - <<'PY'
from cccc_sdk import CCCCClient

c = CCCCClient()
c.assert_compatible(
    require_ipc_v=1,
    require_capabilities={"events_stream": True},
    require_ops=["groups", "send", "reply", "inbox_list", "context_get", "context_sync"],
)
print("OK: daemon is compatible")
PY
```

4) Demo（在本仓库内运行）：

```bash
# 发送消息
python python/examples/send.py --group g_xxx --text "hello"

# 订阅实时事件流
python python/examples/stream.py --group g_xxx

# 自动 ACK 重要消息（以 user 身份）
python python/examples/auto_ack_attention.py --group g_xxx --actor user
```

---

## 版本策略与兼容性

SDK 的 major/minor 对齐 **CCCC 0.4.x**，但补丁/RC 节奏由 SDK 自身维护：
- 稳定版示例：`cccc-sdk==0.4.0` 搭配 `cccc==0.4.x`
- RC 预览示例：`cccc-sdk==0.4.1rc1` 也可能兼容 `cccc==0.4.x`

我们保证兼容性的手段是“契约/能力”，而不是字符串版本号硬匹配：
- IPC 版本（`ipc_v`）
- capability discovery（`capabilities`）
- op probing（拒绝 `unknown_op`）

参考：`python/examples/compat_check.py`。

## 合约文档（contracts）

在 0.4.x 期间，合约文档的“唯一真源”在 CCCC 主仓库（保证 spec 与 daemon 同步演进）。
本仓库的 `spec/` 是镜像，可用脚本刷新：

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## 安全提示

CCCC daemon IPC **没有鉴权**。请只在本地使用，或通过可信 VPN/隧道暴露。
