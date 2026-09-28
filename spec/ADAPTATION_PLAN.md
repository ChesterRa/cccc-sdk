# CCCC SDK adaptation boundary

Target: CCCC **0.4.41**, revision recorded in [core.json](core.json). Python,
TypeScript/npm and Rust packages all use **0.4.41**. Publication is a separate
explicit action; a source checkout or candidate artifact is not a registry release.

## Product boundary

CCCC owns the native daemon, shared state and authorization. These are three
independent IPC v1 client libraries, not additional daemons. The four mirrored
standards (CCCS, daemon IPC, context operations and Connect) are authoritative.
SDK-owned notes are not copied over by spec synchronization.

## Included alignment

- 0.4.41 adds Voice document library read/update/delete helpers in all three
  languages. Empty root ordering and move destinations are preserved; the daemon
  owns validation, permissions, files, archive/restore and deletion tombstones.
- TypeScript explicitly lists `grok_web_model` and `deepseek` runtimes. Actor
  create/update remains a daemon operation; browser login, shared connectors,
  ChatGPT receipt verification and Grok Bot URL setup remain Web-owned workflows.
  See [0.4.41 migration](SDK_0441_MIGRATION.md). No HTTP client, browser controller,
  Actor credential store or automatic retry was added.

- Actor creation omits the retired selectable `runner` field; Runtime determines
  its runner. Python previously sent `runner=pty` even for an ordinary create.

- Current `send` / `request_reply` / `mail` semantics, one audience domain per
  message, non-consuming history and consuming Mail Inbox reads. Published older
  Python/npm versions still sent removed legacy delivery fields; upgrade callers
  to explicit message modes. Replies default to Send and cannot request a reply.
- Qualified Connect catalog, message and file helpers. Remote instance and Group
  IDs plus a caller-owned retry key are explicit. `accepted:true` means durable
  local acceptance, not confirmed remote delivery. Replies use the locally
  received event ID. A remote `#Group` reference never sends a message itself.
- Context version preconditions and terminal render cursors preserve concurrency
  and paginated rendering. Rust retains `context_sync` and provides
  `context_sync_checked` for a precondition and/or dry run.
- Compatibility checks consult exact advertised capabilities and a finite set of
  audited, harmless empty-argument probes. Unadvertised operations without a safe
  probe fail explicitly; they are never called or silently certified. Transport
  failures propagate. `by` identifies a local caller; it is not authentication.
- TypeScript transport fixes from PR #4: bounded stream lines, complete UTF-8
  decoding and absolute request/handshake deadlines. No automatic replay after
  bytes may have been sent. The PR's separate identity/reliability framework is
  outside this adaptation; the daemon owns durable Connect delivery.

## Explicit exclusions and migration

- Retired daemon Presentation browser operations and Voice model installation
  report a local migration error. Use CCCC Web's corresponding surface; the SDK
  does not silently switch to HTTP or acquire a browser controller.
- Direct/account administration, Web-only Files/Git APIs, browser/terminal duplex
  upgrades and provider internals are not mechanically mirrored as typed helpers.
  Supported daemon operations remain accessible through `call` / `call_raw`.
- Rust does not provide a streaming iterator yet. Do not infer feature support
  from equal package versions or from the daemon's implementation label.

## Release gates

1. `check_release_versions.py`: all manifests, lockfiles, core version and release
   tag agree. Runtime compatibility still uses protocol/capabilities, not exact
   daemon-version equality.
2. Supported-release CI checks out the reviewed revision in `spec/core.json` and
   compares all four standards byte for byte. Nightly upstream-main drift is a
   separate maintenance warning and downloadable diff; infrastructure failures
   remain failures. Integrations exercise the pinned core, not a moving branch.
3. Run three-language unit/type/transport gates and build wheel, npm tarball and
   crate. Test installed artifacts against an isolated real daemon, including
   unknown-outcome handling, non-mutating compatibility checks and context conflicts.
4. Record exact evidence after final validation. No hosted CI, Windows/macOS,
   registry publication or production service acceptance is implied by Linux tests.

Rollback is repository-local; SDK maintenance never rewrites the user's CCCC_HOME.

## Local 0.4.41 acceptance — 2026-09-28

- Core contract pin: `0d73fceddef5928bd1d2b8faf8d879d9b056c99a`, the maintained
  0.4.41 revision, including fixes after the original release tag. All four
  standards match byte for byte; three manifests and both lockfiles agree.
- Python: 88 tests and compile check. TypeScript: 130 tests, exported API type
  fixtures and build. Rust: 18 tests, all-target formatting/Clippy and Rust
  1.74.0 minimum-version tests. Wheel/sdist, npm tarball and crate build.
- Installed wheel (Python 3.9), npm tarball (Node 24.19.0) and packaged Rust crate
  passed against an isolated native CCCC 0.4.41 daemon. New coverage exercises
  folder creation/renaming/removal, document renaming/moves, mixed root ordering
  and clearing, archive/restore, permanent deletion and rejected restoration.
  Archive retains the actual file; delete removes it. Wire tests preserve empty
  values and daemon errors without replay.
- Safe compatibility probes pass for the three new operations. Existing Python
  and TypeScript Mail/reply, conflict and compatibility checks pass; TypeScript
  also consumes the real event stream. Each language configures two ChatGPT
  Actors and one Grok Bot Actor in a paused Group without starting providers.
- Evidence: `/tmp/cccc-sdk-0441-1ory14nl/` on the validation host. The isolated
  daemon was stopped and its runtime directory removed. No user services or
  provider accounts were used. Hosted CI, native Windows/macOS, real ChatGPT/Grok
  operation and registry publication are not covered by this local acceptance.

## Local acceptance — 2026-09-19

- Python: 85 tests; TypeScript: 128 tests plus exported type fixtures and examples; Rust:
  16 tests and all-target Clippy. Wheel/sdist, npm tarball and crate build.
- Installed artifacts exercised against two isolated CCCC 0.4.40 instances:
  local Actor creation, Mail/read/reply/files, context conflicts, qualified
  catalog, Direct delivery/reply, and repeated retry keys without duplicate
  remote events. File retry succeeds after the original source file is removed.
- The repository CI smoke scripts also pass locally from installed artifacts,
  including the real event stream. Caller cancellation of an idle TypeScript
  stream was reproduced as an error, then corrected; malformed input still fails.
- Four mirrored standards match core byte for byte. Version validation rejects
  mismatched tags and stale lockfiles; actionlint accepts all workflows.
- Evidence directory: `/tmp/cccc-cross-repo-audit-20260919/` on the validation
  host. Hosted CI, native Windows/macOS SDK execution and registry publication
  have not run for this candidate. No user runtime was modified.

## Follow-up delivery audit — 2026-09-19

The wider audit reproduced and repaired four integration gaps beyond the first
alignment pass:

- The documented `tracked_send` compatibility requirement was missing from the
  audited probe set. Its empty arguments are rejected before any mutation by
  core; all three clients and native smoke checks now include it.
- `sendAndWaitForReply` could leave a rejected stream promise unobserved while
  sending, terminating Node before the caller could handle the error. It now
  observes that promise immediately, still propagates the failure, and does not
  read ahead after the matching reply. No automatic resend was introduced.
- The TypeScript send example used retired `external` Runtime semantics and
  returned exit code zero on failure. It now uses a temporary paused Group and
  custom Actor, cleans up in `finally`, and sends/replies without provider work.
  Example types and the native Mail/reply path are covered by existing CI jobs.
  README quick start uses an existing Group/Agent; Profile examples use the
  supported Codex command rather than `codex exec`.
- The declared setuptools floor could not parse the package's SPDX metadata;
  it is now 77.0.3. The release command `(cd ts && npm pack)` was verified to
  package the SDK, unlike `npm --prefix ts pack` from another directory.

Final checks passed: Python 3.9 wheel/sdist build and install with 85 tests;
Node 18.0.0 installed-artifact smoke and independent NodeNext consumer type
checking; Rust 1.74.0 all-target tests and current-toolchain Clippy/package.
All three final artifacts passed two-daemon Direct/message/file/retry checks.
The installed Python Profile flow passed linked-field rejection, explicit
conversion and environment preservation without starting an Actor. SDK
versions, four standards and workflow lint still agree.

Evidence: `/tmp/cccc-ecosystem-review-20260919/` (`artifact-results.json`,
language-floor logs, `sdk-before.log`, `sdk-after.log`, `stream-before.log`,
`profile-smoke.log`). Linux acceptance is complete for this scope; hosted CI,
native Windows/macOS consumers and registry publication remain separate.
