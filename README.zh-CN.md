# CCCC SDK 0.4.x（RC）— 面向 CCCC daemon 的 Client SDK

[English](README.md) | **中文** | [日本語](README.ja.md)

> 状态：**0.4.0rc1**（Release Candidate）。我们仍在打磨契约与 SDK 易用性，RC 期间可能有行为变化。

CCCC SDK 是一套**客户端 SDK**，用于在 **CCCC daemon**（单写入者协作内核）之上构建更上层的应用。

典型场景：
- 需要实时更新的 Web/IDE 插件（`events_stream`）
- 监听工作组并自动响应的 bot/service
- 以编程方式创建/管理 group、actors、共享 context 的内部工具

**重要说明：SDK 不包含 daemon。** CCCC 仍是唯一事实源：
- daemon 负责写入 `CCCC_HOME`（默认 `~/.cccc/`）下的 ledger/context/presence 等状态；
- SDK 只是通过 **Daemon IPC v1** 调用 daemon 的客户端。

只要 SDK 与 Web UI 指向同一个 `CCCC_HOME`，SDK 写入的一切（消息、ACK、context ops 等）都能在 Web UI 里实时看到。

---

## 快速开始（Python）

1) 启动 CCCC（daemon + web）：

```bash
cccc
```

2) 安装 SDK（RC 通常先发布到 TestPyPI）：

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rc1
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

## 版本策略（为什么 RC 编号不一定和 CCCC 一致）

SDK 的 major/minor 会对齐 **CCCC 0.4.0**，但 **RC 序号由 SDK 自己维护**：
- 例如：`cccc-sdk==0.4.0rc1` 也可以兼容 `cccc==0.4.0rc16`。

我们保证兼容性的手段是“契约/能力”，而不是强行对齐 RC 序号：
- IPC 版本（`ipc_v`）
- capability discovery（`capabilities`）
- op probing（拒绝 `unknown_op`）

参考：`python/examples/compat_check.py`。

---

## 仓库结构

- `spec/` — 合约文档镜像（用于 SDK 开发）
- `python/` — Python 包（PyPI 名称 `cccc-sdk`，import 名称 `cccc_sdk`）
- `ts/` — TypeScript SDK（规划中）

---

## 合约文档（contracts）

在 0.4.x 期间，合约文档的“唯一真源”在 CCCC 主仓库（保证 spec 与 daemon 同步演进）。
本仓库的 `spec/` 是镜像，可用脚本刷新：

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## 安全提示

CCCC daemon IPC **没有鉴权**。请只在本地使用，或通过可信 VPN/隧道暴露。
