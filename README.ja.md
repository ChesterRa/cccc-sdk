# CCCC SDK 0.4.x（RC）— CCCC daemon 向け Client SDK

[English](README.md) | [中文](README.zh-CN.md) | **日本語**

> ステータス：**0.4.0rc1**（Release Candidate）。契約（contracts）と SDK の使い勝手を硬化中です。

CCCC SDK は、**CCCC daemon**（単一 writer の協調カーネル）の上に、より高度なアプリケーションを作るための **クライアント SDK** です。

主な用途：
- リアルタイム更新が必要な Web/IDE プラグイン（`events_stream`）
- Working Group を監視して自動応答する bot/service
- group / actors / shared context をプログラムから管理する社内ツール

**重要：SDK は daemon を同梱しません。** CCCC が唯一の事実源です：
- daemon が `CCCC_HOME`（既定 `~/.cccc/`）配下の ledger/context/presence を管理します。
- SDK は **Daemon IPC v1** で daemon を呼び出すクライアントに過ぎません。

SDK と Web UI が同じ `CCCC_HOME` を参照していれば、SDK が書き込んだ内容（メッセージ、ACK、context ops など）は Web UI に反映されます。

---

## クイックスタート（Python）

1) CCCC を起動（daemon + web）：

```bash
cccc
```

2) SDK をインストール（RC はまず TestPyPI に公開する運用を推奨）：

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rc1
```

3) 互換性チェック（推奨）：

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

4) Demo（このリポジトリ内で実行）：

```bash
# メッセージ送信
python python/examples/send.py --group g_xxx --text "hello"

# リアルタイムイベント購読
python python/examples/stream.py --group g_xxx

# 重要（attention）メッセージを自動 ACK（user として）
python python/examples/auto_ack_attention.py --group g_xxx --actor user
```

---

## バージョニング（RC 番号が CCCC と一致しない理由）

SDK は **CCCC 0.4.0** に major/minor を合わせますが、**RC の連番は SDK 側で管理**します：
- 例：`cccc-sdk==0.4.0rc1` が `cccc==0.4.0rc16` と互換な場合があります。

互換性は “契約/能力” で保証します（RC 連番の厳密一致には依存しません）：
- IPC バージョン（`ipc_v`）
- capability discovery（`capabilities`）
- op probing（`unknown_op` を検出）

参考：`python/examples/compat_check.py`

---

## リポジトリ構成

- `spec/` — SDK 開発用の契約文書ミラー
- `python/` — Python パッケージ（PyPI 名：`cccc-sdk`、import：`cccc_sdk`）
- `ts/` — TypeScript SDK（予定）

---

## Specs（contracts）

0.4.x 期間は、契約文書の “唯一の真源” は CCCC 本体リポジトリ側に置きます（daemon 実装と同期させるため）。
このリポジトリでは `spec/` にミラーを置き、以下で同期できます：

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## セキュリティ注意

CCCC daemon IPC は **認証なし**です。ローカル限定で使うか、信頼できる VPN/トンネル経由で公開してください。
