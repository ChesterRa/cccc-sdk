# CCCC SDK 0.4.x — CCCC 公式クライアント SDK

[English](README.md) | [中文](README.zh-CN.md) | **日本語**

> ステータス：**CCCC 0.4.x 向けに安定提供**。RC ビルドもプレビュー用途で継続提供します。

CCCC SDK は CCCC プラットフォーム向けの **クライアント SDK** です。

## CCCC 本体との関係

- CCCC 本体リポジトリ: https://github.com/ChesterRa/cccc
- `cccc`（本体）は daemon/web/CLI を提供し、`CCCC_HOME` の実行状態を管理します。
- `cccc-sdk`（このリポジトリ）は Python/TypeScript から **Daemon IPC v1** を呼ぶクライアントです。
- SDK 単体では動作せず、実行中の CCCC daemon が必要です。

SDK と CCCC Web が同じ `CCCC_HOME` を参照していれば、書き込みは即時に共有されます
（メッセージ、ACK、context 操作、automation 更新など）。

## このリポジトリに含まれるもの

- `python/` — Python パッケージ（PyPI 名: `cccc-sdk`、import: `cccc_sdk`）
- `ts/` — TypeScript パッケージ（`cccc-sdk`）
- `spec/` — SDK 開発用の契約ドキュメントミラー

主な用途：
- リアルタイム更新が必要な Web/IDE プラグイン（`events_stream`）
- Working Group を監視して自動応答する bot/service
- group / actors / shared context をプログラムから管理する社内ツール

言語別の詳細:
- Python SDK: `python/README.md`
- TypeScript SDK: `ts/README.md`

---

## クイックスタート（Python）

1) CCCC を起動（daemon + web）：

```bash
cccc
```

2) SDK をインストール（安定版）：

```bash
pip install -U cccc-sdk

# RC チャネル（任意、通常は TestPyPI を先行）
pip install -U --pre --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk
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

## バージョニングと互換性

SDK は **CCCC 0.4.x** に major/minor を合わせ、パッチ/RC の進行は SDK 側で管理します：
- 安定版例：`cccc-sdk==0.4.0` と `cccc==0.4.x`
- RC プレビュー例：`cccc-sdk==0.4.1rc1` でも `cccc==0.4.x` と互換な場合があります

互換性は “契約/能力” で保証し、バージョン文字列の厳密一致には依存しません：
- IPC バージョン（`ipc_v`）
- capability discovery（`capabilities`）
- op probing（`unknown_op` を検出）

参考：`python/examples/compat_check.py`

## Specs（contracts）

0.4.x 期間は、契約文書の “唯一の真源” は CCCC 本体リポジトリ側に置きます（daemon 実装と同期させるため）。
このリポジトリでは `spec/` にミラーを置き、以下で同期できます：

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## セキュリティ注意

CCCC daemon IPC は **認証なし**です。ローカル限定で使うか、信頼できる VPN/トンネル経由で公開してください。
