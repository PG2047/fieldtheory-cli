# HANDOFF — fieldtheory-cli (PG2047 fork)

> 上次更新：2026-05-23 · 接手者：下一次 Claude / Codex 会话

## 项目是什么

`afar1/fieldtheory-cli` 的个人 fork（`PG2047/fieldtheory-cli`）。
Twitter/X 书签自动同步 + Karpathy 风格 wiki 生成 CLI，本地优先、零云端。

- **GitHub remote**: https://github.com/PG2047/fieldtheory-cli
- **本地工作树**: Mac Studio 上 `~/projects/fieldtheory-cli`
- **数据目录**: `~/.ft-bookmarks/`（4447 条 bookmark，最后同步 2026-04-12）

## 当前状态（2026-05-23）

```
main HEAD: 4d9c43a docs: add FORK_NOTES.md and HANDOFF.md
           (待会儿这条 commit 会出现在 git log 顶部)
           ↓
           fix(deps): sync package-lock.json with package.json
           ↓
           security: fix P0/P1 issues from dual-model audit
           ↓
           f218784 (fork base — Merge pull request #51 from afar1/...)

vs upstream afar1/main: ahead 2 (commit 文档不算)、behind 46、diverged
```

工作树：clean（本次提交后）。

## 关键历史 / 上下文

### npm link 状态
- `/opt/homebrew/bin/ft` 是 npm link 指向 `~/projects/fieldtheory-cli`
- `ft --version` 显示 `1.2.2`，但源码 `package.json` 是 `1.3.2`——cli 输出没跟上 package.json 改名，属上游遗留，不影响功能
- ⚠️ **不要 `npm install -g fieldtheory@latest`**：会覆盖 npm link 指向 npm registry 的官方版，丢失本地修改

### Lock 文件历史
- 上游 afar1 改 `package.json`（rename + drop `zod`）但漏 commit lock —— npm 生态常见 bug
- fork 继承 mismatch，`npm install` 自动重写 lock
- `4d9c43a` 把重写后的 lock commit 进 main —— **修了一个上游遗留 bug**，可贡献回上游

### 安全审计（`25f501f`）
- Claude Opus 4.6 + GPT-5.4 双盲审计，详细报告见 `SECURITY.md`
- 范围：`/tmp` cookie 权限、prompt injection 防御、skill 安装供应链
- 测试：新增 19 个 security test，160 个测试全过 0 regression

### 数据目录细节（`~/.ft-bookmarks/`）
- `bookmarks.db` — SQLite FTS5 全文索引（6.7 MB）
- `bookmarks.jsonl` — 原始书签（8 MB，4447 行）
- `md/` — 4444 个 markdown + categories/ + domains/ + entities/ + `.obsidian/`
- 用 Obsidian 直接打开 `~/.ft-bookmarks/md/` 即可作 wiki frontend

## 未完事项

| Priority | Item | Notes |
|---|---|---|
| Low | 开 PR 把 `25f501f` 推回 afar1 | security fix，self-contained，接受率应该很高 |
| Low | 开 PR 把 `4d9c43a` 推回 afar1 | lock 同步 fix，trivial 不会被拒 |
| Med | sync 上游 46 个 commit | 需要加 upstream remote → fetch → 决定 merge / rebase；上游可能已用别的方式修了同一个 lock bug，导致冲突 |
| Low | `ft sync` 增量更新书签 | 数据 41 天没新同步 |

## 接手 quick start

```bash
# 切到 Mac Studio
ssh macstudio
cd ~/projects/fieldtheory-cli

# 状态确认
git status
git log --oneline -5
git remote -v

# 想 sync upstream（未来某次）
git remote add upstream https://github.com/afar1/fieldtheory-cli.git
git fetch upstream
git log --oneline HEAD..upstream/main  # 看上游 46 commits 有什么

# 想用 ft 工具
ft status                              # 看数据目录状态
ft sync                                # 增量同步新 bookmark
ft wiki                                # 重新编译 wiki
ft ask "<question>"                    # RAG 问答

# 想开 PR 回 upstream
gh pr create --repo afar1/fieldtheory-cli --base main \
  --head PG2047:main --title "..." --body "..."
```

## Gotchas（接手必读）

- **不要直接改 `README.md`**：上游也在改这个文件，未来 sync 必冲突。fork-specific 文档写到 `FORK_NOTES.md`
- **不要 `npm install -g fieldtheory`**：会覆盖 npm link，丢失本地修改
- **不要 `git fetch --prune` 之前不查 ref**：security/fix-p0-p1-audit 分支已删，commit 已 merge 进 main，但操作前 `git ls-remote origin` 验证一遍稳妥
- **不要 cat `~/.ft-bookmarks/.env`**：93 字节，可能含 LLM API key，path 引用即可，内容不进 context
- **commit author 是 `Bao` (osxkeychain credential)**：跟 PG2047 GitHub 账号已关联，push 不需要额外认证

## 相关文件

- `SECURITY.md` — `25f501f` 的安全审计报告（详细 fix 说明 + 未修的 4 个 medium）
- `FORK_NOTES.md` — fork 对外说明（英文，面向 GitHub 访问者）
- `HANDOFF.md` — 本文档（中文，面向下次会话接手）
- `CLAUDE.md` — 项目级 Claude 规则（上游维护，没动过）
