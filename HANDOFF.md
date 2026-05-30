# HANDOFF — fieldtheory-cli (PG2047 fork)

> 上次更新：2026-05-30 · 接手者：下一次 Claude / Codex 会话

## 项目是什么

`afar1/fieldtheory-cli` 的个人 fork（`PG2047/fieldtheory-cli`）。
Twitter/X 书签自动同步 + Karpathy 风格 wiki 生成 CLI,本地优先、零云端。

- **GitHub remote**: https://github.com/PG2047/fieldtheory-cli
- **本地工作树**: Mac Studio 上 `~/projects/fieldtheory-cli`
- **数据目录**: `~/.ft-bookmarks/`(4549+ 条 bookmark,OAuth 每日自动同步)

## 当前状态(接手时自查)

接手第一步先跑这几条命令确认现状,**不要依赖本文件里写的任何 SHA**(本文件自身也是 commit 的一部分,文档自指必然落后):

```bash
git status                                # 工作树清不清
git log --oneline -10                     # 看最新几个 commit
git rev-list --count f218784..HEAD        # ahead 数(相对 fork 基)
git remote -v                             # 是否已加 upstream
```

按设计预期(自上而下,SHA 自己看 git log):

1. `docs:` 类 commit — fork 文档维护(FORK_NOTES / HANDOFF / 后续更新)
2. `fix(deps)` — `package-lock.json` 同步上游漏 commit 的 mismatch
3. `security` — P0/P1 修复(详见 `SECURITY.md`)
4. `f218784` — fork base(上游 afar1 PR #51 合并点,2026-04-08)

vs upstream `afar1/main`:**ahead ≥2**(fix 类 + docs 类)、**behind 46+**(数字会随上游推进而增长)、状态 **diverged**。

## 关键历史 / 上下文

### 2026-05-30 OAuth2 token 刷新 + x.com 授权端点(重要)
两个真实的上游 bug,均已修 + 提 PR:

- **OAuth2 token 从不刷新(治本)**: 原版只实现 `authorization_code` grant,access token 过期(`expires_in` ~2h)后所有 `ft sync --api` 返回 `401 Unauthorized`,保存的 `refresh_token` 从不使用 → 无人值守/定时同步物理上不可能。新增 `requestTokenRefresh` / `ensureValidTwitterToken`(过期前 5 min proactive 刷新)/ `refreshTwitterTokenNow`(`syncTwitterBookmarks` 里 401 reactive 兜底重试),轮换 refresh token 原子保存(`writeJson` tmp+rename)。→ **上游 PR [#164](https://github.com/afar1/fieldtheory-cli/pull/164)**,fork 分支 `pr-oauth-refresh`(纯刷新)+ `feat/oauth-token-refresh`(刷新 + 本地调优)。
- **授权端点用 twitter.com 而非 x.com**: rebrand 后登录态在 `.x.com` 域,`twitter.com/i/oauth2/authorize` 读不到 cookie → 已登录用户被当未登录,反复登录 + 2FA 失败。改成 `x.com`。→ **上游 PR [#162](https://github.com/afar1/fieldtheory-cli/pull/162) 已合并**。
- **本地个人调优(不进 PR)**: `max_results` 100→10(每页大小)+ 增量 `maxPages` 2→5(单次覆盖最新 50 条,正常日提前停、零额外成本),`bookmarks.ts` API 路径 `created_at` 改存 `postedAt`(原误存 `bookmarkedAt`)。这些是 self-use 偏好,保留在 fork 分支不提上游。

### npm link 状态
- `/opt/homebrew/bin/ft` 是 npm link 指向 `~/projects/fieldtheory-cli`
- `ft --version` 显示 `1.2.2`,但源码 `package.json` 是 `1.3.2` — cli 输出没跟上 package.json 改名,属上游遗留,不影响功能
- ⚠️ **不要 `npm install -g fieldtheory@latest`**:会覆盖 npm link 指向 npm registry 的官方版,丢失本地修改

### Lock 文件历史
- 上游 afar1 改 `package.json`(rename + drop `zod`)但漏 commit lock — npm 生态常见 bug
- fork 继承 mismatch,`npm install` 自动重写 lock
- 已用 fix(deps) commit 把重写后的 lock 进 main — **修了一个上游遗留 bug**,可贡献回上游

### 安全审计(security commit)
- Claude Opus 4.6 + GPT-5.4 双盲审计,详细报告见 `SECURITY.md`
- 范围:`/tmp` cookie 权限、prompt injection 防御、skill 安装供应链
- 测试:新增 19 个 security test,160 个测试全过 0 regression

### 数据目录细节(`~/.ft-bookmarks/`)
- `bookmarks.db` — SQLite FTS5 全文索引(6.7 MB)
- `bookmarks.jsonl` — 原始书签(8 MB,4447 行)
- `md/` — 4444 个 markdown + categories/ + domains/ + entities/ + `.obsidian/`
- 用 Obsidian 直接打开 `~/.ft-bookmarks/md/` 即可作 wiki frontend

## 未完事项

| Priority | Item | Notes |
|---|---|---|
| ✅ Done | 上游 PR x.com 授权端点 | #162 已合并(2026-05-29) |
| Open | 上游 PR OAuth token 刷新 | #164 等 review(off upstream/main,只 xauth.ts+bookmarks.ts,noreply) |
| Low | 开 PR 把 security commit 推回 afar1 | self-contained,接受率应该很高 |
| Low | 开 PR 把 fix(deps) commit 推回 afar1 | lock 同步 fix,trivial 不会被拒 |
| Med | sync 上游 commits | 加 upstream remote → fetch → 决定 merge / rebase;注意 PR #162 已并,部分差异已收敛 |

## 接手 quick start

```bash
# 切到 Mac Studio
ssh macstudio
cd ~/projects/fieldtheory-cli

# 状态确认(参见上面"当前状态")

# 想 sync upstream
git remote add upstream https://github.com/afar1/fieldtheory-cli.git
git fetch upstream
git log --oneline HEAD..upstream/main      # 看上游有什么

# 想用 ft 工具
ft status                                  # 看数据目录状态
ft sync                                    # 增量同步新 bookmark
ft wiki                                    # 重新编译 wiki
ft ask "<question>"                        # RAG 问答

# 想开 PR 回 upstream
gh pr create --repo afar1/fieldtheory-cli --base main \
  --head PG2047:main --title "..." --body "..."
```

## Gotchas(接手必读)

- **不要直接改 `README.md`**:上游也在改这个文件,未来 sync 必冲突。fork-specific 文档写到 `FORK_NOTES.md`
- **不要 `npm install -g fieldtheory`**:会覆盖 npm link,丢失本地修改
- **不要 `git fetch --prune` 之前不查 ref**:旧的 security/fix-p0-p1-audit 分支已删,commit 已 merge 进 main,但 prune 前 `git ls-remote origin` 验证一遍稳妥
- **不要 cat `~/.ft-bookmarks/.env`**:93 字节,可能含 LLM API key,path 引用即可,内容不进 context
- **⚠️ commit 必须用 noreply email**:repo 的 `git config user.email` 是真实个人邮箱,直接 `git commit` 会把它写进公开 commit。**每次提交显式覆盖**:`git -c user.email=PG2047@users.noreply.github.com -c user.name=PG2047 commit ...`。历史 commit 都是 noreply,保持一致。
- **push 走 SSH 不走 HTTPS**:`git push git@github.com:PG2047/fieldtheory-cli.git <branch>`(ssh config 有 PG2047 key);HTTPS push 在本机环境会卡死。push 卡 `Connection reset` 时是出网代理抖动,重试循环即可(别用 `| tail` 吞 git 退出码)

## 相关文件

- `SECURITY.md` — security commit 的安全审计报告(详细 fix 说明 + 未修的 4 个 medium)
- `FORK_NOTES.md` — fork 对外说明(英文,面向 GitHub 访问者)
- `HANDOFF.md` — 本文档(中文,面向下次会话接手)
- `CLAUDE.md` — 项目级 Claude 规则(上游维护,没动过)
