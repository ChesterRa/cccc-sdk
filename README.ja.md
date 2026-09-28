# CCCC SDK — CCCC 公式クライアント SDK

0.4.41 更新：Python・TypeScript・Rust に Voice 文書ライブラリの整理・削除 API を追加し、Grok Bot の Runtime 設定と公開契約を同期しました。アーカイブはファイルを保持し、削除は完全に除去します。ブラウザーのログインと Bot URL は CCCC Web で設定します。[移行ガイド（英語）](spec/SDK_0441_MIGRATION.md)。

[English](README.md) | [中文](README.zh-CN.md) | **日本語**

> ステータス：**CCCC Daemon IPC v1 向けの contract-first SDK**。`main` のソース
> パッケージは現在の CCCC daemon 契約を対象とします。公開は別の release
> 手順です。範囲は `CHANGELOG.md` と `spec/ADAPTATION_PLAN.md` を参照してください。

CCCC SDK は CCCC プラットフォーム向けの **クライアント SDK** です。

## CCCC 本体との関係

- CCCC 本体リポジトリ: https://github.com/ChesterRa/cccc
- `cccc`（本体）は単一のネイティブ Rust daemon/web/CLI を提供し、`CCCC_HOME` の実行状態を管理します。
- `cccc-sdk`（このリポジトリ）は Python、TypeScript、Rust から **Daemon IPC v1** を呼ぶクライアントです。
- SDK 言語は daemon 実装に依存せず、3 言語とも同じネイティブ daemon に接続します。
- SDK 単体では動作せず、実行中の CCCC daemon が必要です。

SDK と CCCC Web が同じ `CCCC_HOME` を参照していれば、書き込みは即時に共有されます
（メッセージ、Inbox 読み取り、context 操作、automation 更新など）。

## このリポジトリに含まれるもの

- `python/` — Python パッケージ（PyPI 名: `cccc-sdk`、import: `cccc_sdk`）
- `ts/` — TypeScript パッケージ（`cccc-sdk`）
- `rust/` — Rust crate（`cccc-sdk`、crate 名 `cccc_sdk`）
- `spec/` — SDK 開発用の契約ドキュメントミラー

主な用途：
- リアルタイム更新が必要な Web/IDE プラグイン（`events_stream`）
- Working Group を監視して自動応答する bot/service
- group / actors / shared context / capability ポリシー / Group Space をプログラムから管理する社内ツール
- `tracked_send`、Context Ops v3 task/agent state、capability discovery、ローカル memory API を使う workflow 連携

言語別の詳細:
- Python SDK: `python/README.md`
- TypeScript SDK: `ts/README.md`
- Rust SDK: `rust/README.md`

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
    require_ops=["groups", "send", "reply", "inbox_read", "context_get", "context_sync"],
)
print("OK: daemon is compatible")
PY
```

4) Demo（このリポジトリ内で実行）：

```bash
# メッセージ送信
python python/examples/send.py --group g_xxx --text "hello" --mode send

# リアルタイムイベント購読
python python/examples/stream.py --group g_xxx

# 有用だが緊急でない情報を受信者の Inbox に入れる
python python/examples/send.py --group g_xxx --text "FYI" --mode mail
```

## クイックスタート（Rust）

```toml
[dependencies]
cccc-sdk = "0.4.41"
```

Rust クライアントは `CCCC_HOME` の Unix Socket/TCP daemon を自動検出し、
汎用 `call` と group、chat、inbox、context の主要メソッドを提供します。
詳細は `rust/README.md` を参照してください。

---

## バージョニングと互換性

SDK リリースは daemon のバージョン文字列ではなく contract に追従します：
- Python・TypeScript/npm・Rust SDK は対応する CCCC 本体と同じバージョンを使います。今回は **0.4.41** で、契約の基準は `spec/core.json` に記録します。
- 実行時互換性は `assert_compatible(...)` で必要な capability/op を指定して確認します。

互換性は “契約/能力” で保証し、バージョン文字列の厳密一致には依存しません：
- IPC バージョン（`ipc_v`）
- capability discovery（`capabilities`）
- op probing（`unknown_op` を検出）

参考：`python/examples/compat_check.py`

## Specs（contracts）

現在の CCCC daemon 系列では、契約文書の “唯一の真源” は CCCC 本体リポジトリ側に置きます（daemon 実装と同期させるため）。
このリポジトリでは `spec/` にミラーを置き、以下で同期できます：

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## セキュリティ注意

CCCC daemon IPC は **認証なし**です。ローカル限定で使うか、信頼できる VPN/トンネル経由で公開してください。
