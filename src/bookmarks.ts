import { ensureDir, pathExists, readJson, readJsonLines, writeJson, writeJsonLines } from './fs.js';
import { ensureDataDir, twitterBackfillStatePath, twitterBookmarksCachePath, twitterBookmarksMetaPath } from './paths.js';
import type { BookmarkBackfillState, BookmarkCacheMeta, BookmarkMediaObject, BookmarkRecord, QuotedTweetSnapshot } from './types.js';
import { loadXApiConfig } from './config.js';
import { ensureValidTwitterToken, refreshTwitterTokenNow } from './xauth.js';

export interface BookmarkSyncResult {
  mode: 'full' | 'incremental';
  totalBookmarks: number;
  added: number;
  cachePath: string;
  metaPath: string;
}

type BookmarkApiMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
  variants?: Array<{ url?: string; content_type?: string; bit_rate?: number }>;
};

type BookmarkApiUser = { id: string; username?: string; name?: string; profile_image_url?: string };

type BookmarkApiTweet = {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  entities?: {
    urls?: Array<{ expanded_url?: string; url?: string }>;
  };
  attachments?: { media_keys?: string[] };
  referenced_tweets?: Array<{ type?: string; id?: string }>;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
};

type BookmarkApiResponse = {
  data?: BookmarkApiTweet[];
  includes?: {
    users?: BookmarkApiUser[];
    media?: BookmarkApiMedia[];
    tweets?: BookmarkApiTweet[];
  };
  meta?: {
    next_token?: string;
    result_count?: number;
  };
};

function makeBookmark(record: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id' | 'tweetId' | 'url' | 'text'>): BookmarkRecord {
  return {
    id: record.id,
    tweetId: record.tweetId,
    url: record.url,
    text: record.text,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    authorProfileImageUrl: record.authorProfileImageUrl,
    postedAt: record.postedAt,
    bookmarkedAt: record.bookmarkedAt,
    syncedAt: record.syncedAt ?? new Date().toISOString(),
    media: record.media ?? [],
    mediaObjects: record.mediaObjects,
    engagement: record.engagement,
    quotedStatusId: record.quotedStatusId,
    quotedTweet: record.quotedTweet,
    links: record.links ?? [],
    tags: record.tags ?? [],
  };
}

async function fetchJsonWithUserToken(url: string, accessToken: string): Promise<{ ok: boolean; status: number; parsed: any; text: string }> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    parsed,
    text,
  };
}

async function fetchCurrentUserId(accessToken: string): Promise<{ ok: boolean; id?: string; status: number; detail: string }> {
  const result = await fetchJsonWithUserToken('https://api.x.com/2/users/me', accessToken);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      detail: result.parsed ? JSON.stringify(result.parsed) : result.text,
    };
  }

  const id = result.parsed?.data?.id;
  if (!id) {
    return {
      ok: false,
      status: result.status,
      detail: 'Could not find user id in /2/users/me response',
    };
  }

  return {
    ok: true,
    id: String(id),
    status: result.status,
    detail: 'Resolved current user id',
  };
}

function buildBookmarkMedia(
  tweet: BookmarkApiTweet,
  mediaMap: Map<string, BookmarkApiMedia>,
  tweetUrl: string,
): { media: string[]; mediaObjects: BookmarkMediaObject[] } {
  const media: string[] = [];
  const mediaObjects: BookmarkMediaObject[] = [];
  for (const key of tweet.attachments?.media_keys ?? []) {
    const m = mediaMap.get(String(key));
    if (!m) continue;
    // photos expose `url`; video / animated_gif expose `preview_image_url` (the poster).
    const poster = m.url || m.preview_image_url;
    if (!poster) continue;
    media.push(poster);
    const variants = Array.isArray(m.variants)
      ? m.variants
          .filter((v) => v.url)
          .map((v) => ({ bitrate: v.bit_rate ?? 0, url: String(v.url) }))
      : [];
    // Runtime shape matches the existing GraphQL data and the site renderer
    // (url / expandedUrl / videoVariants), which differs from the legacy BookmarkMediaObject type.
    const obj = {
      type: m.type,
      url: poster,
      expandedUrl: tweetUrl,
      width: m.width,
      height: m.height,
      ...(m.alt_text ? { altText: m.alt_text } : {}),
      ...(variants.length ? { videoVariants: variants } : {}),
    } as unknown as BookmarkMediaObject;
    mediaObjects.push(obj);
  }
  return { media, mediaObjects };
}

function normalizeBookmarkPage(page: BookmarkApiResponse, syncedAt: string): BookmarkRecord[] {
  const userMap = new Map<string, BookmarkApiUser>();
  for (const user of page.includes?.users ?? []) userMap.set(String(user.id), user);
  const mediaMap = new Map<string, BookmarkApiMedia>();
  for (const m of page.includes?.media ?? []) mediaMap.set(String(m.media_key), m);
  const tweetMap = new Map<string, BookmarkApiTweet>();
  for (const t of page.includes?.tweets ?? []) tweetMap.set(String(t.id), t);

  const tweetUrl = (tweet: BookmarkApiTweet): string => {
    const handle = tweet.author_id ? userMap.get(String(tweet.author_id))?.username : undefined;
    return `https://x.com/${handle ?? 'i'}/status/${String(tweet.id)}`;
  };

  return (page.data ?? []).map((tweet) => {
    const user = tweet.author_id ? userMap.get(String(tweet.author_id)) : undefined;
    const tweetId = String(tweet.id);
    const url = tweetUrl(tweet);
    const { media, mediaObjects } = buildBookmarkMedia(tweet, mediaMap, url);

    const pm = tweet.public_metrics;
    const engagement = pm
      ? {
          likeCount: pm.like_count,
          repostCount: pm.retweet_count,
          replyCount: pm.reply_count,
          quoteCount: pm.quote_count,
          bookmarkCount: pm.bookmark_count,
          viewCount: pm.impression_count,
        }
      : undefined;

    const quotedRef = (tweet.referenced_tweets ?? []).find((r) => r.type === 'quoted');
    let quotedTweet: QuotedTweetSnapshot | undefined;
    if (quotedRef?.id) {
      const qt = tweetMap.get(String(quotedRef.id));
      if (qt) {
        const qUser = qt.author_id ? userMap.get(String(qt.author_id)) : undefined;
        const qUrl = tweetUrl(qt);
        const qMedia = buildBookmarkMedia(qt, mediaMap, qUrl);
        quotedTweet = {
          id: String(qt.id),
          text: qt.text ?? '',
          authorHandle: qUser?.username,
          authorName: qUser?.name,
          authorProfileImageUrl: qUser?.profile_image_url,
          postedAt: qt.created_at,
          media: qMedia.media,
          mediaObjects: qMedia.mediaObjects,
          url: qUrl,
        };
      }
    }

    return makeBookmark({
      id: tweetId,
      tweetId,
      url,
      text: tweet.text ?? '',
      authorHandle: user?.username,
      authorName: user?.name,
      authorProfileImageUrl: user?.profile_image_url,
      // X API created_at is the tweet post time, not the bookmark time; store it as postedAt.
      postedAt: tweet.created_at,
      syncedAt,
      links: (tweet.entities?.urls ?? []).map((u) => u.expanded_url ?? u.url ?? '').filter(Boolean),
      media,
      mediaObjects,
      engagement,
      quotedStatusId: quotedRef?.id ? String(quotedRef.id) : undefined,
      quotedTweet,
    });
  });
}

async function fetchBookmarksPage(accessToken: string, userId: string, nextToken?: string): Promise<{ ok: boolean; status: number; detail: string; page?: BookmarkApiResponse; requestUrl: string }> {
  const url = new URL(`https://api.x.com/2/users/${userId}/bookmarks`);
  url.searchParams.set("max_results", "10");
  url.searchParams.set('tweet.fields', 'created_at,author_id,entities,attachments,referenced_tweets,public_metrics');
  url.searchParams.set('expansions', 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys');
  url.searchParams.set('media.fields', 'url,preview_image_url,type,variants,width,height,alt_text');
  url.searchParams.set('user.fields', 'username,name,profile_image_url');
  if (nextToken) url.searchParams.set('pagination_token', nextToken);

  const result = await fetchJsonWithUserToken(url.toString(), accessToken);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      detail: result.parsed ? JSON.stringify(result.parsed) : result.text,
      requestUrl: url.toString(),
    };
  }

  return {
    ok: true,
    status: result.status,
    detail: 'ok',
    page: result.parsed as BookmarkApiResponse,
    requestUrl: url.toString(),
  };
}

export async function syncTwitterBookmarks(
  mode: 'full' | 'incremental',
  options: { targetAdds?: number } = {}
): Promise<BookmarkSyncResult> {
  const token = await ensureValidTwitterToken();
  if (!token?.access_token) {
    throw new Error('Missing user-context OAuth token. Run: ft auth');
  }

  let accessToken = token.access_token;
  let me = await fetchCurrentUserId(accessToken);
  if (!me.ok && me.status === 401) {
    // Access token may have been revoked or expired ahead of its stated lifetime; refresh once and retry.
    const refreshed = await refreshTwitterTokenNow();
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      me = await fetchCurrentUserId(accessToken);
    }
  }
  if (!me.ok || !me.id) {
    throw new Error(`Could not resolve current user id: ${me.detail}`);
  }

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const now = new Date().toISOString();
  const existing = await readJsonLines<BookmarkRecord>(cachePath);
  const existingById = new Map(existing.map((item) => [item.id, item]));

  const allFetched: BookmarkRecord[] = [];
  let nextToken: string | undefined;
  let pages = 0;
  const maxPages = mode === 'full' ? 20 : 5;

  while (pages < maxPages) {
    const pageResult = await fetchBookmarksPage(accessToken, me.id, nextToken);
    if (!pageResult.ok || !pageResult.page) {
      throw new Error(`Bookmark fetch failed (${pageResult.status}): ${pageResult.detail}`);
    }

    const normalized = normalizeBookmarkPage(pageResult.page, now);
    allFetched.push(...normalized);
    nextToken = pageResult.page.meta?.next_token;
    pages += 1;

    if (!nextToken) break;
    if (mode === 'incremental' && normalized.every((item) => existingById.has(item.id))) break;
    if (typeof options.targetAdds === 'number') {
      const uniqueAddsSoFar = allFetched.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index).filter((item) => !existingById.has(item.id)).length;
      if (uniqueAddsSoFar >= options.targetAdds) break;
    }
  }

  const merged = [...existing];
  let added = 0;
  for (const record of allFetched) {
    if (!existingById.has(record.id)) {
      merged.push(record);
      existingById.set(record.id, record);
      added += 1;
      if (typeof options.targetAdds === 'number' && added >= options.targetAdds) break;
    }
  }

  merged.sort((a, b) => String(b.bookmarkedAt ?? b.syncedAt).localeCompare(String(a.bookmarkedAt ?? a.syncedAt)));
  await writeJsonLines(cachePath, merged);

  const previousMeta = (await pathExists(metaPath)) ? await readJson<BookmarkCacheMeta>(metaPath) : undefined;
  const meta: BookmarkCacheMeta = {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: mode === 'full' ? now : previousMeta?.lastFullSyncAt,
    lastIncrementalSyncAt: mode === 'incremental' ? now : previousMeta?.lastIncrementalSyncAt,
    totalBookmarks: merged.length,
  };
  await writeJson(metaPath, meta);

  return {
    mode,
    totalBookmarks: merged.length,
    added,
    cachePath,
    metaPath,
  };
}

export function latestBookmarkSyncAt(
  meta?: Pick<BookmarkCacheMeta, 'lastIncrementalSyncAt' | 'lastFullSyncAt'> | null,
): string | null {
  let latestValue: string | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const candidate of [meta?.lastIncrementalSyncAt, meta?.lastFullSyncAt]) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isFinite(parsed) || parsed <= latestTs) continue;
    latestTs = parsed;
    latestValue = candidate;
  }

  return latestValue;
}

export async function getTwitterBookmarksStatus(): Promise<BookmarkCacheMeta & { cachePath: string; metaPath: string }> {
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const statePath = twitterBackfillStatePath();
  const meta = (await pathExists(metaPath))
    ? await readJson<BookmarkCacheMeta>(metaPath)
    : undefined;
  const state = (await pathExists(statePath))
    ? await readJson<BookmarkBackfillState>(statePath)
    : undefined;
  const metaUpdatedAt = latestBookmarkSyncAt(meta);
  const graphQlStatusIsNewer = Boolean(
    state?.lastRunAt && (!metaUpdatedAt || Date.parse(state.lastRunAt) > Date.parse(metaUpdatedAt))
  );

  if (!meta || graphQlStatusIsNewer) {
    const totalBookmarks = (await readJsonLines<BookmarkRecord>(cachePath)).length;
    return {
      provider: 'twitter',
      schemaVersion: meta?.schemaVersion ?? 1,
      lastFullSyncAt: meta?.lastFullSyncAt,
      lastIncrementalSyncAt: state?.lastRunAt ?? meta?.lastIncrementalSyncAt,
      totalBookmarks,
      cachePath,
      metaPath,
    };
  }

  return {
    ...meta,
    cachePath,
    metaPath,
  };
}
