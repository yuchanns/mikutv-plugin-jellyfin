// Official Jellyfin source plugin for MikuTV (Apache-2.0).
// Pure ES module running inside MikuTV's sandboxed moejs runtime.
// Connects strictly to the user-entered Jellyfin server origin.

const CLIENT_NAME = "MikuTV";
const CLIENT_DEVICE = "Apple TV";
const CLIENT_VERSION = "1.0.8";
const TICKS_PER_SECOND = 10000000;

const COPY = {
  "zh-Hans": {
    serverBadge: "Jellyfin 服务器",
    continueWatching: "继续观看",
    latestAdded: "最近添加",
    movies: "电影",
    series: "剧集",
    episodes: "剧集列表",
    favorites: "我的收藏",
    mostPlayed: "热门播放",
    topRated: "高分精选",
    allLibraries: "全部媒体库",
    seasonEp: (s, e) => `第 ${s} 季 · 第 ${e} 集`,
    epOnly: (e) => `第 ${e} 集`,
    movieLabel: "电影",
    seriesLabel: "剧集",
    episodeLabel: "单集",
    libraryCardTitle: "Jellyfin",
    libraryCardDesc: "自由开源的个人媒体系统。",
    benefitDirect: "电影与剧集",
    benefitHLS: "直连与 HLS",
    benefitSubtitles: "外挂字幕",
    benefitResume: "进度同步",
    connected: "已连接",
    originalQuality: "原画",
    subtitleTrack: (i) => `字幕 ${i}`,
    audioTrack: (i) => `音轨 ${i}`,
    chapterTitle: (i) => `第 ${i} 章`,
    playlistFallback: "片单",
    personCategory: "演职员",
    birthDate: "出生日期",
    birthPlace: "出生地",
  },
  ja: {
    serverBadge: "Jellyfin サーバー",
    continueWatching: "視聴を続ける",
    latestAdded: "最近追加された作品",
    movies: "映画",
    series: "シリーズ",
    episodes: "エピソード",
    favorites: "お気に入り",
    mostPlayed: "よく再生される作品",
    topRated: "高評価",
    allLibraries: "すべてのライブラリ",
    seasonEp: (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`,
    epOnly: (e) => `第${e}話`,
    movieLabel: "映画",
    seriesLabel: "シリーズ",
    episodeLabel: "エピソード",
    libraryCardTitle: "Jellyfin",
    libraryCardDesc: "自由でオープンソースのメディアシステム。",
    benefitDirect: "映画とドラマ",
    benefitHLS: "ダイレクト再生 / HLS",
    benefitSubtitles: "字幕対応",
    benefitResume: "進捗同期",
    connected: "接続中",
    originalQuality: "オリジナル",
    subtitleTrack: (i) => `字幕 ${i}`,
    audioTrack: (i) => `音声 ${i}`,
    chapterTitle: (i) => `チャプター ${i}`,
    playlistFallback: "プレイリスト",
    personCategory: "キャスト・スタッフ",
    birthDate: "生年月日",
    birthPlace: "出生地",
  },
  en: {
    serverBadge: "Jellyfin Server",
    continueWatching: "Continue Watching",
    latestAdded: "Recently Added",
    movies: "Movies",
    series: "TV Shows",
    episodes: "Episodes",
    favorites: "Favorites",
    mostPlayed: "Most Played",
    topRated: "Top Rated",
    allLibraries: "All Libraries",
    seasonEp: (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`,
    epOnly: (e) => `Episode ${e}`,
    movieLabel: "Movie",
    seriesLabel: "Series",
    episodeLabel: "Episode",
    libraryCardTitle: "Jellyfin",
    libraryCardDesc: "The Free Software Media System.",
    benefitDirect: "Movies & TV",
    benefitHLS: "Direct Play & HLS",
    benefitSubtitles: "Subtitles",
    benefitResume: "Progress Sync",
    connected: "Connected",
    originalQuality: "Original",
    subtitleTrack: (i) => `Subtitle ${i}`,
    audioTrack: (i) => `Audio ${i}`,
    chapterTitle: (i) => `Chapter ${i}`,
    playlistFallback: "Playlist",
    personCategory: "Cast & Crew",
    birthDate: "Born",
    birthPlace: "Birthplace",
  },
};

function hasHostFeature(name) {
  try {
    return Boolean(typeof host !== "undefined" && host && host.features && host.features[name] === true);
  } catch (_) {
    return false;
  }
}

function t() {
  let lang = "en";
  try {
    if (typeof host !== "undefined" && host.locale && typeof host.locale.current === "function") {
      lang = String(host.locale.current() || "en");
    }
  } catch (_) {}
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return COPY["zh-Hans"];
  if (lower.startsWith("ja")) return COPY.ja;
  return COPY.en;
}

function qs(params) {
  const parts = [];
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    const val = params[key];
    if (val === undefined || val === null || val === "") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(val)));
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function cleanBase(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function quoteHeaderValue(val) {
  return String(val || "").replace(/["\\]/g, "");
}

function makeDeviceId(serverURL, username) {
  const seed = "mikutv-jellyfin:" + cleanBase(serverURL).toLowerCase() + ":" + String(username || "").toLowerCase();
  try {
    if (typeof host !== "undefined" && host.crypto && typeof host.crypto.sha256 === "function") {
      return "mikutv-" + host.crypto.sha256(seed).slice(0, 24);
    }
  } catch (_) {}
  return "mikutv-appletv-default";
}

function authHeader(deviceId, token) {
  let hdr =
    `MediaBrowser Client="${CLIENT_NAME}", Device="${CLIENT_DEVICE}", ` +
    `DeviceId="${quoteHeaderValue(deviceId || "mikutv-appletv")}", Version="${CLIENT_VERSION}"`;
  if (token) {
    hdr += `, Token="${quoteHeaderValue(token)}"`;
  }
  return hdr;
}

function requireSecret(secret) {
  if (!secret || !secret.serverURL || !secret.accessToken || !secret.userId) {
    throw { code: "signIn", message: "Sign in to your Jellyfin server first." };
  }
  return {
    serverURL: cleanBase(secret.serverURL),
    accessToken: String(secret.accessToken),
    userId: String(secret.userId),
    deviceId: String(secret.deviceId || "mikutv-appletv"),
    serverName: String(secret.serverName || "Jellyfin"),
    serverVersion: String(secret.serverVersion || ""),
  };
}

async function jfFetch(base, path, opts) {
  const options = opts || {};
  const headers = Object.assign(
    {
      Accept: "application/json",
      Authorization: authHeader(options.deviceId, options.token),
    },
    options.headers || {}
  );
  const fetchOpts = { method: options.method || "GET", headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(options.body);
  }
  let resp;
  try {
    resp = await fetch(base + path, fetchOpts);
  } catch (err) {
    throw { code: "network", message: String((err && err.message) || err || "network error") };
  }
  if (resp.status === 401 || resp.status === 403) {
    throw { code: "signIn", message: "Jellyfin authentication required or invalid credentials." };
  }
  if (resp.status === 429) {
    throw { code: "rateLimited", message: "Jellyfin rate limited request." };
  }
  if (resp.status === 204) {
    return null;
  }
  if (!resp.ok) {
    throw { code: "network", message: "Jellyfin HTTP " + resp.status };
  }
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

// Session-scoped host.cache (MikuTV >= 0.1.5). Every helper degrades to a
// no-op on older hosts so callers fall back to plain network reads.
const CACHE_PREFIX = "jf:v1:";
const TTL_VIEWS = 600;
const TTL_EPISODES = 300;
const TTL_ITEM = 120;
const TTL_SIMILAR = 600;

function hasCache() {
  return (
    typeof host !== "undefined" &&
    !!host.cache &&
    typeof host.cache.get === "function" &&
    typeof host.cache.set === "function"
  );
}

function cacheGetJSON(key) {
  if (!hasCache()) return undefined;
  try {
    const raw = host.cache.get(key);
    if (typeof raw !== "string" || !raw) return undefined;
    return JSON.parse(raw);
  } catch (_) {
    return undefined;
  }
}

function cacheSetJSON(key, value, ttlSec) {
  if (!hasCache()) return;
  try {
    host.cache.set(key, JSON.stringify(value), ttlSec);
  } catch (_) {}
}

function cacheScope(s) {
  return s.serverURL.toLowerCase() + "|" + s.userId;
}

// Generation token for entries that embed per-user play state (UserData).
// Rotating it on progress reports orphans those entries at once; a fresh
// random token on miss means an evicted token can never revive stale data.
function userDataGen(s, rotate) {
  if (!hasCache()) return "";
  const key = CACHE_PREFIX + "gen:" + cacheScope(s);
  if (!rotate) {
    try {
      const cur = host.cache.get(key);
      if (typeof cur === "string" && cur) return cur;
    } catch (_) {
      return "";
    }
  }
  const next = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try {
    host.cache.set(key, next, 0);
  } catch (_) {
    return "";
  }
  return next;
}

async function cachedJSON(key, ttlSec, load) {
  if (!key) return load();
  const hit = cacheGetJSON(key);
  if (hit !== undefined) return hit;
  const value = await load();
  if (value !== undefined && value !== null) cacheSetJSON(key, value, ttlSec);
  return value;
}

const SLIM_ITEM_KEYS = [
  "Id",
  "Type",
  "Name",
  "Overview",
  "SeriesName",
  "SeriesId",
  "SeriesPrimaryImageTag",
  "ParentIndexNumber",
  "IndexNumber",
  "ProductionYear",
  "Genres",
  "CommunityRating",
  "RunTimeTicks",
  "PremiereDate",
  "ImageTags",
  "BackdropImageTags",
  "ParentBackdropItemId",
  "ParentBackdropImageTags",
  "ParentThumbItemId",
  "ParentThumbImageTag",
  "Trickplay",
];
const SLIM_USERDATA_KEYS = ["PlaybackPositionTicks", "IsFavorite", "Played", "LastPlayedDate"];
const SLIM_STREAM_KEYS = ["Type", "Width", "Height", "BitRate", "VideoRange", "VideoRangeType"];
const SLIM_PERSON_KEYS = ["Id", "Name", "Type", "PrimaryImageTag", "Role"];
const SLIM_CHAPTER_KEYS = ["Name", "StartPositionTicks", "ImageTag"];

function pick(src, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    if (src[keys[i]] !== undefined) out[keys[i]] = src[keys[i]];
  }
  return out;
}

// Keep only fields read by mapMediaItem/getItem/resolvePlayback so cached
// entries stay well under host.cache's per-entry limit (MediaSources are big).
function slimItem(item) {
  if (!item || typeof item !== "object") return item;
  const out = pick(item, SLIM_ITEM_KEYS);
  if (item.UserData && typeof item.UserData === "object") out.UserData = pick(item.UserData, SLIM_USERDATA_KEYS);
  if (Array.isArray(item.MediaSources)) {
    out.MediaSources = item.MediaSources.map((ms) => {
      const slim = {
        Id: ms && ms.Id,
        MediaStreams: ms && Array.isArray(ms.MediaStreams)
          ? ms.MediaStreams.filter((st) => st && st.Type === "Video").map((st) => pick(st, SLIM_STREAM_KEYS))
          : [],
      };
      if (ms && ms.Bitrate != null) slim.Bitrate = ms.Bitrate;
      return slim;
    });
  }
  if (Array.isArray(item.People) && item.People.length > 0) {
    out.People = item.People
      .filter((p) => p && p.Id && p.Name)
      .slice(0, 24)
      .map((p) => pick(p, SLIM_PERSON_KEYS));
  }
  if (Array.isArray(item.Chapters) && item.Chapters.length > 0) {
    out.Chapters = item.Chapters
      .filter((ch) => ch && ch.StartPositionTicks != null)
      .map((ch) => pick(ch, SLIM_CHAPTER_KEYS));
  }
  return out;
}

async function fetchUserItem(s, id) {
  const gen = userDataGen(s, false);
  const key = gen ? CACHE_PREFIX + "item:" + cacheScope(s) + "|" + gen + "|" + id : "";
  return cachedJSON(key, TTL_ITEM, async () => {
    const item = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(id), {
      deviceId: s.deviceId,
      token: s.accessToken,
    });
    return item && item.Id ? slimItem(item) : null;
  });
}

function ticksToSeconds(ticks) {
  const n = Number(ticks);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n / TICKS_PER_SECOND);
}

function imageURL(base, token, itemId, kind, tag, maxWidth) {
  if (!itemId) return "";
  return (
    base +
    "/Items/" +
    encodeURIComponent(itemId) +
    "/Images/" +
    kind +
    qs({ maxWidth: maxWidth || 960, quality: 90, tag: tag || "", api_key: token })
  );
}

function backdropURLFor(base, token, item) {
  if (!item) return "";
  if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0) {
    return imageURL(base, token, item.Id, "Backdrop/0", item.BackdropImageTags[0], 1920);
  }
  if (item.ParentBackdropItemId && Array.isArray(item.ParentBackdropImageTags) && item.ParentBackdropImageTags.length > 0) {
    return imageURL(base, token, item.ParentBackdropItemId, "Backdrop/0", item.ParentBackdropImageTags[0], 1920);
  }
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return imageURL(base, token, item.SeriesId, "Backdrop/0", "", 1920);
  }
  return "";
}

function coverURLFor(base, token, item) {
  if (!item) return "";
  const tags = item.ImageTags || {};
  // Prefer 16:9 Thumb or Backdrop for widescreen TV cards; fall back to Primary.
  if (item.Type === "Episode") {
    if (tags.Primary) return imageURL(base, token, item.Id, "Primary", tags.Primary, 960);
    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return imageURL(base, token, item.ParentThumbItemId, "Thumb", item.ParentThumbImageTag, 960);
    }
    const bd = backdropURLFor(base, token, item);
    if (bd) return bd;
    if (item.SeriesId && item.SeriesPrimaryImageTag) {
      return imageURL(base, token, item.SeriesId, "Primary", item.SeriesPrimaryImageTag, 960);
    }
    return "";
  }
  if (tags.Thumb) return imageURL(base, token, item.Id, "Thumb", tags.Thumb, 960);
  if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0) {
    return imageURL(base, token, item.Id, "Backdrop/0", item.BackdropImageTags[0], 960);
  }
  if (tags.Primary) return imageURL(base, token, item.Id, "Primary", tags.Primary, 960);
  return backdropURLFor(base, token, item);
}

function mediaKindFor(item) {
  switch (item && item.Type) {
    case "Movie":
      return "movie";
    case "Series":
      return "series";
    case "Episode":
      return "episode";
    default:
      return "video";
  }
}

function videoQualityBadge(item) {
  const sources = item && Array.isArray(item.MediaSources) ? item.MediaSources : [];
  for (let i = 0; i < sources.length; i++) {
    const streams = Array.isArray(sources[i].MediaStreams) ? sources[i].MediaStreams : [];
    for (let j = 0; j < streams.length; j++) {
      const s = streams[j];
      if (s.Type !== "Video") continue;
      const w = Number(s.Width || 0);
      const h = Number(s.Height || 0);
      const hdr =
        s.VideoRange === "HDR" ||
        s.VideoRangeType === "HDR10" ||
        s.VideoRangeType === "DOVI" ||
        s.VideoRangeType === "DOVIWithHDR10";
      if (w >= 3800 || h >= 2100) return hdr ? "4K HDR" : "4K";
      if (w >= 1900 || h >= 1000) return hdr ? "1080p HDR" : "1080p";
      if (w >= 1200 || h >= 700) return "720p";
    }
  }
  return "";
}

function categoryText(item) {
  const parts = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (Array.isArray(item.Genres) && item.Genres.length > 0) {
    parts.push(item.Genres.slice(0, 2).join(" / "));
  }
  if (item.CommunityRating) {
    parts.push("★ " + Number(item.CommunityRating).toFixed(1));
  }
  return parts.join(" · ");
}

function mapMediaItem(base, token, item) {
  const copy = t();
  const kind = mediaKindFor(item);
  let title = String(item.Name || "");
  let subtitle = String(item.Overview || "").replace(/\s+/g, " ").trim();
  if (item.Type === "Episode") {
    const epTag =
      item.ParentIndexNumber != null && item.IndexNumber != null
        ? copy.seasonEp(item.ParentIndexNumber, item.IndexNumber)
        : item.IndexNumber != null
          ? copy.epOnly(item.IndexNumber)
          : "";
    if (item.SeriesName) {
      title = item.SeriesName + (epTag ? " · " + epTag : "");
      if (item.Name && item.Name !== item.SeriesName) {
        subtitle = item.Name + (subtitle ? " — " + subtitle : "");
      }
    } else if (epTag) {
      subtitle = epTag + (subtitle ? " · " + subtitle : "");
    }
  }
  if (!subtitle) {
    subtitle = categoryText(item);
  }
  const duration = ticksToSeconds(item.RunTimeTicks);
  const pos = ticksToSeconds(item.UserData && item.UserData.PlaybackPositionTicks);
  const out = {
    ref: { kind, id: String(item.Id) },
    title,
    subtitle,
    coverURL: coverURLFor(base, token, item),
    backdropURL: backdropURLFor(base, token, item),
    category: categoryText(item),
    quality: videoQualityBadge(item),
  };
  if (duration !== undefined) out.durationSeconds = duration;
  if (pos !== undefined && pos > 0) out.progressSeconds = pos;
  return out;
}

function buildAccountObject(base, token, user, serverName, serverVersion, accountId) {
  const copy = t();
  const uid = String(user.Id || "");
  const rawName = String(user.Name || "Jellyfin User");
  const displayName = serverName && serverName.toLowerCase() !== "jellyfin" ? `${rawName} · ${serverName}` : rawName;
  const avatarURL = user.PrimaryImageTag
    ? base + "/Users/" + encodeURIComponent(uid) + "/Images/Primary" + qs({ maxWidth: 256, tag: user.PrimaryImageTag, api_key: token })
    : "";
  const badgeText = serverVersion ? `${serverName} · Jellyfin ${serverVersion}` : serverName;
  return {
    id: accountId || uid,
    name: displayName,
    avatarURL,
    badge: { text: badgeText, icon: "home" },
    card: {
      title: copy.libraryCardTitle,
      description: copy.libraryCardDesc,
      icon: "play",
      status: copy.connected,
      highlight: true,
      benefits: [copy.benefitDirect, copy.benefitHLS, copy.benefitSubtitles, copy.benefitResume],
    },
  };
}

export async function signInWithCredentials(req) {
  const base = cleanBase(req && req.serverURL);
  const username = String((req && req.username) || "").trim();
  const password = String((req && req.password) || "");
  if (!base || !username) {
    throw { code: "signIn", message: "Server URL and username are required." };
  }
  const deviceId = makeDeviceId(base, username);
  let serverName = "Jellyfin";
  let serverVersion = "";
  let serverId = "";
  try {
    const pub = await jfFetch(base, "/System/Info/Public", { deviceId });
    if (pub) {
      if (pub.ServerName) serverName = String(pub.ServerName);
      if (pub.Version) serverVersion = String(pub.Version);
      if (pub.Id) serverId = String(pub.Id);
    }
  } catch (_) {}

  const auth = await jfFetch(base, "/Users/AuthenticateByName", {
    method: "POST",
    deviceId,
    body: { Username: username, Pw: password },
  });
  if (!auth || !auth.AccessToken || !auth.User || !auth.User.Id) {
    throw { code: "signIn", message: "Invalid Jellyfin credentials." };
  }
  if (!serverId && auth.ServerId) serverId = String(auth.ServerId);
  const uid = String(auth.User.Id);
  const accountId = serverId ? `${serverId}:${uid}` : `${base.toLowerCase()}|${uid}`;
  const secret = {
    serverURL: base,
    accessToken: String(auth.AccessToken),
    userId: uid,
    accountId,
    deviceId,
    serverName,
    serverVersion,
  };
  return {
    account: buildAccountObject(base, secret.accessToken, auth.User, serverName, serverVersion, accountId),
    secret,
  };
}

export async function restoreAccount(secret) {
  const s = requireSecret(secret);
  const user = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId), {
    deviceId: s.deviceId,
    token: s.accessToken,
  });
  if (!user || !user.Id) {
    throw { code: "signIn", message: "Jellyfin session expired." };
  }
  let serverName = s.serverName;
  let serverVersion = s.serverVersion;
  try {
    const pub = await jfFetch(s.serverURL, "/System/Info/Public", { deviceId: s.deviceId });
    if (pub) {
      if (pub.ServerName) serverName = String(pub.ServerName);
      if (pub.Version) serverVersion = String(pub.Version);
    }
  } catch (_) {}
  const accountId = String((secret && secret.accountId) || s.userId);
  const nextSecret = Object.assign({}, s, { accountId, serverName, serverVersion });
  return {
    account: buildAccountObject(s.serverURL, s.accessToken, user, serverName, serverVersion, accountId),
    secret: nextSecret,
  };
}

export async function signOut(secret) {
  try {
    const s = requireSecret(secret);
    await jfFetch(s.serverURL, "/Sessions/Logout", {
      method: "POST",
      deviceId: s.deviceId,
      token: s.accessToken,
    });
  } catch (_) {}
  return {};
}

const ITEM_FIELDS = "Overview,Genres,BackdropImageTags,ImageTags,MediaSources,PrimaryImageAspectRatio,DateCreated";

async function fetchViews(s) {
  const key = hasCache() ? CACHE_PREFIX + "views:" + cacheScope(s) : "";
  return cachedJSON(key, TTL_VIEWS, async () => {
    const data = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Views", {
      deviceId: s.deviceId,
      token: s.accessToken,
    });
    const items = (data && Array.isArray(data.Items)) ? data.Items : [];
    return items.map((v) => pick(v || {}, ["Id", "Name", "CollectionType"]));
  });
}

export async function browse(req) {
  const s = requireSecret(req && req.secret);
  const copy = t();
  const collection = String((req && req.collection) || "");
  const filter = String((req && req.filter) || "");
  const startIndex = Math.max(0, parseInt(String((req && req.cursor) || "0"), 10) || 0);
  const limit = 24;

  if (collection === "") {
    if (startIndex > 0) {
      const more = await jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items" +
          qs({
            IncludeItemTypes: "Movie,Series",
            Recursive: "true",
            SortBy: "DateCreated,SortName",
            SortOrder: "Descending",
            StartIndex: startIndex,
            Limit: limit,
            Fields: ITEM_FIELDS,
          }),
        { deviceId: s.deviceId, token: s.accessToken }
      );
      const rawItems = (more && Array.isArray(more.Items)) ? more.Items : [];
      const items = rawItems.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
      const total = Number((more && more.TotalRecordCount) || 0);
      const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
      return {
        collections: items.length ? [{ id: "library-all", title: copy.latestAdded, items }] : [],
        nextCursor,
      };
    }

    const [views, resumeResp, latestResp, moviesResp, seriesResp] = await Promise.all([
      fetchViews(s).catch(() => []),
      jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items/Resume" +
          qs({ Limit: 12, Recursive: "true", MediaTypes: "Video", Fields: ITEM_FIELDS }),
        { deviceId: s.deviceId, token: s.accessToken }
      ).catch(() => ({ Items: [] })),
      jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items/Latest" +
          qs({ Limit: 18, Fields: ITEM_FIELDS }),
        { deviceId: s.deviceId, token: s.accessToken }
      ).catch(() => []),
      jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items" +
          qs({
            IncludeItemTypes: "Movie",
            Recursive: "true",
            SortBy: "DateCreated,SortName",
            SortOrder: "Descending",
            Limit: 20,
            Fields: ITEM_FIELDS,
          }),
        { deviceId: s.deviceId, token: s.accessToken }
      ).catch(() => ({ Items: [] })),
      jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items" +
          qs({
            IncludeItemTypes: "Series",
            Recursive: "true",
            SortBy: "DateCreated,SortName",
            SortOrder: "Descending",
            Limit: 20,
            Fields: ITEM_FIELDS,
          }),
        { deviceId: s.deviceId, token: s.accessToken }
      ).catch(() => ({ Items: [] })),
    ]);

    const resumeItems = ((resumeResp && resumeResp.Items) || []).map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
    const latestRaw = Array.isArray(latestResp) ? latestResp : (latestResp && latestResp.Items) || [];
    const moviesRaw = (moviesResp && moviesResp.Items) || [];
    const seriesRaw = (seriesResp && seriesResp.Items) || [];

    // Build featured picks prioritizing items with widescreen backdrops (Series & Movies).
    const seen = {};
    const heroCandidates = [];
    const pushUnique = (list) => {
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it || !it.Id || seen[it.Id]) continue;
        if (it.Type !== "Movie" && it.Type !== "Series" && it.Type !== "Episode") continue;
        seen[it.Id] = true;
        heroCandidates.push(mapMediaItem(s.serverURL, s.accessToken, it));
      }
    };
    pushUnique(seriesRaw.filter((x) => x.BackdropImageTags && x.BackdropImageTags.length > 0));
    pushUnique(moviesRaw.filter((x) => x.BackdropImageTags && x.BackdropImageTags.length > 0));
    pushUnique(latestRaw);
    pushUnique(moviesRaw);
    pushUnique(seriesRaw);

    let moviesTitle = copy.movies;
    let seriesTitle = copy.series;
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      if (v.CollectionType === "movies" && v.Name) moviesTitle = v.Name;
      if (v.CollectionType === "tvshows" && v.Name) seriesTitle = v.Name;
    }

    const collections = [];
    if (heroCandidates.length > 0) {
      collections.push({ id: "latest", title: copy.latestAdded, items: heroCandidates.slice(0, 15) });
    }
    const moviesItems = moviesRaw.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
    const seriesItems = seriesRaw.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
    if (moviesItems.length > 0) {
      collections.push({ id: "movies", title: moviesTitle, items: moviesItems });
    }
    if (seriesItems.length > 0) {
      collections.push({ id: "series", title: seriesTitle, items: seriesItems });
    }

    const shelves = [];
    if (moviesItems.length > 0) {
      shelves.push({ id: "movies-shelf", title: moviesTitle, items: moviesItems.slice(0, 12) });
    } else if (seriesItems.length > 0) {
      shelves.push({ id: "series-shelf", title: seriesTitle, items: seriesItems.slice(0, 12) });
    }

    return { collections, shelves };
  }

  if (collection === "regions") {
    const views = await fetchViews(s);
    const filters = [{ id: "all", title: copy.allLibraries }];
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      if (!v.Id || !v.Name) continue;
      if (v.CollectionType === "music" || v.CollectionType === "books" || v.CollectionType === "photos") continue;
      filters.push({ id: String(v.Id), title: String(v.Name) });
    }
    const activeParent = filter && filter !== "all" ? filter : "";
    const resp = await jfFetch(
      s.serverURL,
      "/Users/" +
        encodeURIComponent(s.userId) +
        "/Items" +
        qs({
          ParentId: activeParent,
          IncludeItemTypes: activeParent ? "Movie,Series,Video" : "Movie,Series",
          Recursive: "true",
          SortBy: "SortName",
          SortOrder: "Ascending",
          StartIndex: startIndex,
          Limit: limit,
          Fields: ITEM_FIELDS,
        }),
      { deviceId: s.deviceId, token: s.accessToken }
    );
    const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
    const items = rawItems.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
    const total = Number((resp && resp.TotalRecordCount) || 0);
    const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
    let heading = copy.allLibraries;
    for (let i = 0; i < filters.length; i++) {
      if (filters[i].id === activeParent) heading = filters[i].title;
    }
    return {
      filters,
      collections: items.length ? [{ id: activeParent || "all", title: heading, items }] : [],
      nextCursor,
    };
  }

  const sortBy = collection === "ranking" ? "CommunityRating,CriticRating,SortName" : "PlayCount,DateCreated,SortName";
  const heading = collection === "ranking" ? copy.topRated : copy.mostPlayed;
  const resp = await jfFetch(
    s.serverURL,
    "/Users/" +
      encodeURIComponent(s.userId) +
      "/Items" +
      qs({
        IncludeItemTypes: "Movie,Series",
        Recursive: "true",
        SortBy: sortBy,
        SortOrder: "Descending",
        StartIndex: startIndex,
        Limit: limit,
        Fields: ITEM_FIELDS,
      }),
    { deviceId: s.deviceId, token: s.accessToken }
  );
  const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
  const items = rawItems.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
  const total = Number((resp && resp.TotalRecordCount) || 0);
  const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
  return {
    collections: items.length ? [{ id: collection, title: heading, items }] : [],
    nextCursor,
  };
}

async function fetchSeriesEpisodes(s, seriesId) {
  const copy = t();
  // Segment output carries no play state, so this entry needs no generation.
  const key = hasCache() ? CACHE_PREFIX + "eps:" + cacheScope(s) + "|" + seriesId : "";
  const rawList = await cachedJSON(key, TTL_EPISODES, async () => {
    const data = await jfFetch(
      s.serverURL,
      "/Shows/" +
        encodeURIComponent(seriesId) +
        "/Episodes" +
        qs({ UserId: s.userId, Fields: "Overview,MediaSources", Limit: 200 }),
      { deviceId: s.deviceId, token: s.accessToken }
    );
    const items = (data && Array.isArray(data.Items)) ? data.Items : [];
    return items.map((ep) => pick(ep || {}, ["Id", "Name", "ParentIndexNumber", "IndexNumber", "RunTimeTicks"]));
  });
  // Place regular seasons (Season 1+) ahead of Specials (Season 0).
  const list = rawList.slice().sort((a, b) => {
    const sa = a.ParentIndexNumber != null ? Number(a.ParentIndexNumber) : 9999;
    const sb = b.ParentIndexNumber != null ? Number(b.ParentIndexNumber) : 9999;
    const ra = sa === 0 ? 1 : 0;
    const rb = sb === 0 ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (sa !== sb) return sa - sb;
    const ea = a.IndexNumber != null ? Number(a.IndexNumber) : 9999;
    const eb = b.IndexNumber != null ? Number(b.IndexNumber) : 9999;
    return ea - eb;
  });
  return list.map((ep, idx) => {
    const tag =
      ep.ParentIndexNumber != null && ep.IndexNumber != null
        ? copy.seasonEp(ep.ParentIndexNumber, ep.IndexNumber)
        : ep.IndexNumber != null
          ? copy.epOnly(ep.IndexNumber)
          : copy.epOnly(idx + 1);
    const title = ep.Name ? `${tag} · ${ep.Name}` : tag;
    const seg = {
      title,
      partID: String(ep.Id),
    };
    const dur = ticksToSeconds(ep.RunTimeTicks);
    if (dur !== undefined) seg.durationSeconds = dur;
    return seg;
  });
}

async function fetchSimilar(s, itemId) {
  const gen = userDataGen(s, false);
  const key = gen ? CACHE_PREFIX + "similar:" + cacheScope(s) + "|" + gen + "|" + itemId : "";
  return cachedJSON(key, TTL_SIMILAR, async () => {
    const data = await jfFetch(
      s.serverURL,
      "/Items/" + encodeURIComponent(itemId) + "/Similar" + qs({ UserId: s.userId, Limit: 12, Fields: ITEM_FIELDS }),
      { deviceId: s.deviceId, token: s.accessToken }
    );
    if (!data) return null;
    return { Items: Array.isArray(data.Items) ? data.Items.map(slimItem) : [] };
  });
}

function buildDetailCreators(base, token, item) {
  const people = item && Array.isArray(item.People) ? item.People : [];
  if (people.length === 0) return [];
  const seen = {};
  const actorWithImg = [];
  const actorNoImg = [];
  const directorWithImg = [];
  const other = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    if (!p || !p.Id || !p.Name) continue;
    const id = String(p.Id).trim();
    const name = String(p.Name).trim();
    if (!id || !name || seen[id]) continue;
    seen[id] = true;
    const type = String(p.Type || "").toLowerCase();
    const hasImg = Boolean(p.PrimaryImageTag);
    const entry = {
      id,
      name,
      avatarURL: hasImg ? imageURL(base, token, id, "Primary", p.PrimaryImageTag, 256) : "",
      hideName: true,
    };
    if (type === "actor") {
      if (hasImg) actorWithImg.push(entry);
      else actorNoImg.push(entry);
    } else if (type === "director" && hasImg) {
      directorWithImg.push(entry);
    } else {
      other.push(entry);
    }
  }
  return actorWithImg.concat(actorNoImg, directorWithImg, other).slice(0, 12);
}

export async function getItem(req) {
  const s = requireSecret(req && req.secret);
  const id = String((req && (req.id || (req.ref && req.ref.id))) || "");
  if (!id) throw { code: "plugin", message: "missing item id" };

  const item = await fetchUserItem(s, id);
  if (!item || !item.Id) throw { code: "plugin", message: "item not found" };

  const mapped = mapMediaItem(s.serverURL, s.accessToken, item);
  if (hasHostFeature("multiCreators")) {
    const creators = buildDetailCreators(s.serverURL, s.accessToken, item);
    if (creators.length > 0) {
      mapped.creators = creators;
    }
  }
  const [segments, similarResp] = await Promise.all([
    item.Type === "Series"
      ? fetchSeriesEpisodes(s, item.Id).catch(() => [])
      : item.Type === "Episode" && item.SeriesId
        ? fetchSeriesEpisodes(s, item.SeriesId).catch(() => [])
        : Promise.resolve([]),
    fetchSimilar(s, item.Id).catch(() => ({ Items: [] })),
  ]);

  const related = ((similarResp && similarResp.Items) || []).map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
  const publishedAt = item.PremiereDate ? Math.floor(Date.parse(item.PremiereDate) / 1000) || 0 : 0;
  mapped.videoDetails = {
    publishedAt: publishedAt > 0 ? publishedAt : 0,
    access: "granted",
    segments,
    segmentKind: segments.length > 0 ? "parts" : "",
    related,
    engagement: {
      favorite: Boolean(item.UserData && item.UserData.IsFavorite),
    },
  };
  return mapped;
}

async function fetchPersonMeta(s, creatorID) {
  const key = hasCache() ? CACHE_PREFIX + "person:" + cacheScope(s) + "|" + creatorID : "";
  return cachedJSON(key, TTL_ITEM, async () => {
    const data = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(creatorID), {
      deviceId: s.deviceId,
      token: s.accessToken,
    });
    if (!data || !data.Id) return null;
    return pick(data, ["Id", "Name", "Overview", "ImageTags", "BackdropImageTags", "PremiereDate", "ProductionLocations"]);
  });
}

async function fetchPersonFilmography(s, creatorID, startIndex, limit) {
  const gen = userDataGen(s, false);
  const key = gen ? CACHE_PREFIX + "personitems:" + cacheScope(s) + "|" + gen + "|" + creatorID + "|" + startIndex : "";
  return cachedJSON(key, TTL_ITEM, async () => {
    const data = await jfFetch(
      s.serverURL,
      "/Users/" +
        encodeURIComponent(s.userId) +
        "/Items" +
        qs({
          PersonIds: creatorID,
          IncludeItemTypes: "Movie,Series",
          Recursive: "true",
          SortBy: "PremiereDate,ProductionYear,SortName",
          SortOrder: "Descending",
          StartIndex: startIndex,
          Limit: limit,
          Fields: ITEM_FIELDS,
        }),
      { deviceId: s.deviceId, token: s.accessToken }
    );
    if (!data) return { Items: [], TotalRecordCount: 0 };
    return {
      Items: Array.isArray(data.Items) ? data.Items.map(slimItem) : [],
      TotalRecordCount: Number(data.TotalRecordCount || 0),
    };
  });
}

export async function readCreator(req) {
  const s = requireSecret(req && req.secret);
  const copy = t();
  const creatorID = String((req && req.creatorID) || "").trim();
  if (!creatorID) throw { code: "plugin", message: "missing creator id" };
  const tab = String((req && req.tab) || "videos");
  const startIndex = Math.max(0, parseInt(String((req && req.cursor) || "0"), 10) || 0);
  const includeProfile = Boolean(req && req.includeProfile);
  const limit = 24;

  const needItems = tab === "videos" || tab === "" || includeProfile;
  const [person, filmResp] = await Promise.all([
    includeProfile ? fetchPersonMeta(s, creatorID).catch(() => null) : Promise.resolve(null),
    needItems ? fetchPersonFilmography(s, creatorID, startIndex, limit).catch(() => ({ Items: [], TotalRecordCount: 0 })) : Promise.resolve(null),
  ]);

  const rawItems = (filmResp && Array.isArray(filmResp.Items)) ? filmResp.Items : [];
  const items = rawItems.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
  const total = Number((filmResp && filmResp.TotalRecordCount) || items.length);
  const nextCursor = tab !== "about" && startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";

  const out = {
    items: tab === "about" ? [] : items,
    nextCursor,
  };

  if (includeProfile) {
    const name = String((person && person.Name) || creatorID).trim();
    const tags = (person && person.ImageTags) || {};
    const avatarURL = tags.Primary ? imageURL(s.serverURL, s.accessToken, creatorID, "Primary", tags.Primary, 512) : "";
    let backdropURL = person ? backdropURLFor(s.serverURL, s.accessToken, person) : "";
    if (!backdropURL && items.length > 0 && items[0].backdropURL) {
      backdropURL = items[0].backdropURL;
    }
    const bio = String((person && person.Overview) || "").replace(/\s+/g, " ").trim();
    const attributes = [];
    if (person && person.PremiereDate) {
      const born = String(person.PremiereDate).slice(0, 10);
      if (born) attributes.push({ label: copy.birthDate, value: born });
    }
    if (person && Array.isArray(person.ProductionLocations) && person.ProductionLocations.length > 0) {
      const place = person.ProductionLocations.map((x) => String(x || "").trim()).filter(Boolean).join(", ");
      if (place) attributes.push({ label: copy.birthPlace, value: place });
    }
    const tabs = bio || attributes.length > 0 ? ["videos", "about"] : ["videos"];
    out.profile = {
      creator: {
        id: creatorID,
        name,
        avatarURL,
      },
      bio,
      backdropURL,
      category: copy.personCategory,
      works: total,
      attributes,
      tabs,
    };
  }
  return out;
}

export async function search(req) {
  const s = requireSecret(req && req.secret);
  const query = String((req && req.query) || "").trim();
  const kind = String((req && req.kind) || "all");
  const startIndex = Math.max(0, parseInt(String((req && req.cursor) || "0"), 10) || 0);
  const limit = 24;

  if (!query) {
    return { items: [], kinds: ["all", "video", "series"] };
  }

  let includeTypes = "Movie,Series,Episode";
  if (kind === "video") includeTypes = "Movie,Episode";
  else if (kind === "series") includeTypes = "Series";

  let sortBy = "SortName";
  let sortOrder = "Ascending";
  if (req && req.sort === "newest") {
    sortBy = "DateCreated,PremiereDate";
    sortOrder = "Descending";
  } else if (req && req.sort === "views") {
    sortBy = "PlayCount,CommunityRating";
    sortOrder = "Descending";
  }

  const resp = await jfFetch(
    s.serverURL,
    "/Users/" +
      encodeURIComponent(s.userId) +
      "/Items" +
      qs({
        SearchTerm: query,
        IncludeItemTypes: includeTypes,
        Recursive: "true",
        SortBy: sortBy,
        SortOrder: sortOrder,
        StartIndex: startIndex,
        Limit: limit,
        Fields: ITEM_FIELDS,
      }),
    { deviceId: s.deviceId, token: s.accessToken }
  );
  const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
  const items = rawItems.map((it) => mapMediaItem(s.serverURL, s.accessToken, it));
  const total = Number((resp && resp.TotalRecordCount) || items.length);
  const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
  return {
    items,
    total,
    nextCursor,
    kinds: ["all", "video", "series"],
  };
}

export async function searchSuggest(req) {
  const s = requireSecret(req && req.secret);
  const query = String((req && req.query) || "").trim();
  if (!query) return { suggestions: [] };
  const resp = await jfFetch(
    s.serverURL,
    "/Search/Hints" +
      qs({
        UserId: s.userId,
        SearchTerm: query,
        Limit: 10,
        IncludeItemTypes: "Movie,Series,Episode,Person",
      }),
    { deviceId: s.deviceId, token: s.accessToken }
  ).catch(() => null);
  const hints = (resp && Array.isArray(resp.SearchHints)) ? resp.SearchHints : [];
  const seen = {};
  const suggestions = [];
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i];
    const name = String((h && (h.Name || h.MatchedTerm)) || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    suggestions.push(name);
    if (suggestions.length >= 10) break;
  }
  return { suggestions };
}

export async function editVideo(req) {
  const s = requireSecret(req && req.secret);
  const refId = String((req && req.ref && req.ref.id) || "").trim();
  const interaction = String((req && req.interaction) || "").trim();
  if (!refId) throw { code: "plugin", message: "missing item id" };

  if (interaction === "favorite") {
    const enabled = Boolean(req && req.enabled);
    await jfFetch(
      s.serverURL,
      "/Users/" + encodeURIComponent(s.userId) + "/FavoriteItems/" + encodeURIComponent(refId),
      {
        method: enabled ? "POST" : "DELETE",
        deviceId: s.deviceId,
        token: s.accessToken,
      }
    );
    userDataGen(s, true);
    return { favorite: enabled };
  }
  throw { code: "unsupported", message: "unsupported video interaction: " + interaction };
}

const FAVORITES_FOLDER_ID = "favorites";

async function fetchUserPlaylists(s) {
  const resp = await jfFetch(
    s.serverURL,
    "/Users/" +
      encodeURIComponent(s.userId) +
      "/Items" +
      qs({
        IncludeItemTypes: "Playlist",
        Recursive: "true",
        SortBy: "SortName",
        SortOrder: "Ascending",
        Fields: "ChildCount,ImageTags,PrimaryImageAspectRatio",
      }),
    { deviceId: s.deviceId, token: s.accessToken }
  ).catch(() => ({ Items: [] }));
  return (resp && Array.isArray(resp.Items)) ? resp.Items : [];
}

async function fetchPlaylistItems(s, playlistId, startIndex, limit) {
  return jfFetch(
    s.serverURL,
    "/Playlists/" +
      encodeURIComponent(playlistId) +
      "/Items" +
      qs({
        UserId: s.userId,
        StartIndex: startIndex,
        Limit: limit,
        Fields: ITEM_FIELDS,
      }),
    { deviceId: s.deviceId, token: s.accessToken }
  );
}

function mapAccountMediaRow(s, it, removalID) {
  const media = mapMediaItem(s.serverURL, s.accessToken, it);
  const row = {
    id: String(it.Id),
    title: media.title,
    subtitle: media.subtitle,
    coverURL: media.coverURL,
    ref: media.ref,
    item: media,
    finished: Boolean(it.UserData && it.UserData.Played),
  };
  if (removalID) row.removalID = String(removalID);
  if (media.durationSeconds !== undefined) row.durationSeconds = media.durationSeconds;
  if (media.progressSeconds !== undefined) row.progressSeconds = media.progressSeconds;
  if (it.UserData && it.UserData.LastPlayedDate) {
    const ts = Math.floor(Date.parse(it.UserData.LastPlayedDate) / 1000);
    if (ts > 0) row.time = ts;
  }
  return row;
}

export async function readAccount(req) {
  const s = requireSecret(req && req.secret);
  const copy = t();
  const section = String((req && req.section) || "");
  const folder = String((req && req.folder) || "").trim();
  const startIndex = Math.max(0, parseInt(String((req && req.cursor) || "0"), 10) || 0);
  const limit = 24;

  if (section === "history") {
    // Query played & in-progress items ordered by DatePlayed descending rather
    // than /Items/Resume, because /Items/Resume hides both finished items and
    // items watched below Jellyfin's MinResumePct threshold.
    const path =
      "/Users/" +
      encodeURIComponent(s.userId) +
      "/Items" +
      qs({
        IncludeItemTypes: "Movie,Episode",
        Recursive: "true",
        SortBy: "DatePlayed",
        SortOrder: "Descending",
        StartIndex: startIndex,
        Limit: limit,
        Fields: ITEM_FIELDS,
      });
    const resp = await jfFetch(s.serverURL, path, { deviceId: s.deviceId, token: s.accessToken });
    const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
    const playedItems = rawItems.filter(
      (it) =>
        it &&
        it.UserData &&
        (it.UserData.LastPlayedDate || Number(it.UserData.PlaybackPositionTicks || 0) > 0 || it.UserData.Played)
    );
    const rows = playedItems.map((it) => mapAccountMediaRow(s, it, it.Id));
    const reachedUnplayedTail = playedItems.length < rawItems.length;
    const total = Number((resp && resp.TotalRecordCount) || rawItems.length);
    const nextCursor =
      !reachedUnplayedTail && startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
    return { rows, nextCursor };
  }

  if (section === "favorites") {
    if (!folder) {
      const [favProbe, playlists] = await Promise.all([
        jfFetch(
          s.serverURL,
          "/Users/" +
            encodeURIComponent(s.userId) +
            "/Items" +
            qs({
              Filters: "IsFavorite",
              IncludeItemTypes: "Movie,Series,Episode",
              Recursive: "true",
              SortBy: "SortName",
              Limit: 1,
              Fields: "ImageTags,PrimaryImageAspectRatio",
            }),
          { deviceId: s.deviceId, token: s.accessToken }
        ).catch(() => ({ Items: [], TotalRecordCount: 0 })),
        fetchUserPlaylists(s),
      ]);
      const favTotal = Number((favProbe && favProbe.TotalRecordCount) || 0);
      const favFirst = favProbe && Array.isArray(favProbe.Items) && favProbe.Items[0];
      const rows = [
        {
          id: FAVORITES_FOLDER_ID,
          title: copy.favorites,
          count: favTotal,
          coverURL: favFirst ? coverURLFor(s.serverURL, s.accessToken, favFirst) : "",
          canDelete: false,
          ref: { kind: "collection", id: FAVORITES_FOLDER_ID },
        },
      ];
      for (let i = 0; i < playlists.length; i++) {
        const pl = playlists[i];
        if (!pl || !pl.Id) continue;
        rows.push({
          id: String(pl.Id),
          title: String(pl.Name || copy.playlistFallback),
          count: Math.max(0, Number(pl.ChildCount || 0)),
          coverURL: coverURLFor(s.serverURL, s.accessToken, pl),
          canDelete: true,
          ref: { kind: "collection", id: String(pl.Id) },
        });
      }
      return { rows, total: rows.length };
    }

    if (folder === FAVORITES_FOLDER_ID) {
      const resp = await jfFetch(
        s.serverURL,
        "/Users/" +
          encodeURIComponent(s.userId) +
          "/Items" +
          qs({
            Filters: "IsFavorite",
            IncludeItemTypes: "Movie,Series,Episode",
            Recursive: "true",
            SortBy: "SortName",
            StartIndex: startIndex,
            Limit: limit,
            Fields: ITEM_FIELDS,
          }),
        { deviceId: s.deviceId, token: s.accessToken }
      );
      const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
      const total = Number((resp && resp.TotalRecordCount) || rawItems.length);
      const rows = rawItems.map((it) => mapAccountMediaRow(s, it, it.Id));
      const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
      return { rows, total, nextCursor };
    }

    const resp = await fetchPlaylistItems(s, folder, startIndex, limit);
    const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
    const total = Number((resp && resp.TotalRecordCount) || rawItems.length);
    const rows = rawItems.map((it) => mapAccountMediaRow(s, it, it.PlaylistItemId || it.Id));
    const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
    return { rows, total, nextCursor };
  }

  return { rows: [] };
}

export async function removeAccountItems(req) {
  const s = requireSecret(req && req.secret);
  const section = String((req && req.section) || "");
  const ids = (req && Array.isArray(req.ids)) ? req.ids : [];
  if (section !== "history" || ids.length === 0) return {};

  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i] || "").trim();
    if (!id) continue;
    await jfFetch(
      s.serverURL,
      "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(id) + "/UserData",
      {
        method: "POST",
        deviceId: s.deviceId,
        token: s.accessToken,
        body: { PlaybackPositionTicks: 0, Played: false, LastPlayedDate: null },
      }
    );
  }
  userDataGen(s, true);
  return {};
}

export async function videoFavoriteFolders(req) {
  const s = requireSecret(req && req.secret);
  const copy = t();
  const refId = String((req && req.ref && req.ref.id) || "").trim();
  if (!refId) throw { code: "plugin", message: "missing item id" };

  const [item, favProbe, playlists] = await Promise.all([
    fetchUserItem(s, refId).catch(() => null),
    jfFetch(
      s.serverURL,
      "/Users/" +
        encodeURIComponent(s.userId) +
        "/Items" +
        qs({ Filters: "IsFavorite", IncludeItemTypes: "Movie,Series,Episode", Recursive: "true", Limit: 0 }),
      { deviceId: s.deviceId, token: s.accessToken }
    ).catch(() => ({ TotalRecordCount: 0 })),
    fetchUserPlaylists(s),
  ]);

  const folders = [
    {
      id: FAVORITES_FOLDER_ID,
      title: copy.favorites,
      count: Math.max(0, Number((favProbe && favProbe.TotalRecordCount) || 0)),
      selected: Boolean(item && item.UserData && item.UserData.IsFavorite),
    },
  ];

  const limitedPlaylists = playlists.filter((pl) => pl && pl.Id).slice(0, 12);
  const refLower = refId.toLowerCase();
  for (let i = 0; i < limitedPlaylists.length; i += 3) {
    const batch = limitedPlaylists.slice(i, i + 3);
    const checks = await Promise.all(
      batch.map(async (pl) => {
        const resp = await jfFetch(
          s.serverURL,
          "/Playlists/" + encodeURIComponent(pl.Id) + "/Items" + qs({ UserId: s.userId, Limit: 200 }),
          { deviceId: s.deviceId, token: s.accessToken }
        ).catch(() => ({ Items: [] }));
        const items = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
        const selected = items.some((it) => String((it && it.Id) || "").toLowerCase() === refLower);
        return {
          id: String(pl.Id),
          title: String(pl.Name || copy.playlistFallback),
          count: Math.max(0, Number(pl.ChildCount != null ? pl.ChildCount : items.length)),
          selected,
        };
      })
    );
    for (let j = 0; j < checks.length; j++) folders.push(checks[j]);
  }
  return { folders };
}

export async function editVideoFavoriteFolders(req) {
  const s = requireSecret(req && req.secret);
  const data = (req && req.data) || req || {};
  const refId = String((data.ref && data.ref.id) || "").trim();
  const add = Array.isArray(data.add) ? data.add : [];
  const remove = Array.isArray(data.remove) ? data.remove : [];
  if (!refId) throw { code: "plugin", message: "missing item id" };

  for (let i = 0; i < add.length; i++) {
    const folderId = String(add[i] || "").trim();
    if (!folderId) continue;
    if (folderId === FAVORITES_FOLDER_ID) {
      await jfFetch(
        s.serverURL,
        "/Users/" + encodeURIComponent(s.userId) + "/FavoriteItems/" + encodeURIComponent(refId),
        { method: "POST", deviceId: s.deviceId, token: s.accessToken }
      );
    } else {
      await jfFetch(
        s.serverURL,
        "/Playlists/" + encodeURIComponent(folderId) + "/Items" + qs({ Ids: refId, UserId: s.userId }),
        { method: "POST", deviceId: s.deviceId, token: s.accessToken }
      );
    }
  }

  for (let i = 0; i < remove.length; i++) {
    const folderId = String(remove[i] || "").trim();
    if (!folderId) continue;
    if (folderId === FAVORITES_FOLDER_ID) {
      await jfFetch(
        s.serverURL,
        "/Users/" + encodeURIComponent(s.userId) + "/FavoriteItems/" + encodeURIComponent(refId),
        { method: "DELETE", deviceId: s.deviceId, token: s.accessToken }
      );
    } else {
      const resp = await jfFetch(
        s.serverURL,
        "/Playlists/" + encodeURIComponent(folderId) + "/Items" + qs({ UserId: s.userId, Limit: 200 }),
        { deviceId: s.deviceId, token: s.accessToken }
      ).catch(() => ({ Items: [] }));
      const items = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
      const refLower = refId.toLowerCase();
      const entryIds = items
        .filter((it) => String((it && it.Id) || "").toLowerCase() === refLower && it.PlaylistItemId)
        .map((it) => String(it.PlaylistItemId));
      if (entryIds.length > 0) {
        await jfFetch(
          s.serverURL,
          "/Playlists/" + encodeURIComponent(folderId) + "/Items" + qs({ EntryIds: entryIds.join(",") }),
          { method: "DELETE", deviceId: s.deviceId, token: s.accessToken }
        );
      }
    }
  }
  userDataGen(s, true);
  return {};
}

export async function editFavoriteFolder(req) {
  const s = requireSecret(req && req.secret);
  const action = String((req && req.action) || "").trim();
  const folder = String((req && req.folder) || "").trim();
  const title = String((req && req.title) || "").trim();
  const resources = (req && Array.isArray(req.resources)) ? req.resources : [];

  if (action === "create") {
    await jfFetch(s.serverURL, "/Playlists", {
      method: "POST",
      deviceId: s.deviceId,
      token: s.accessToken,
      body: { Name: title, UserId: s.userId, MediaType: "Video" },
    });
    userDataGen(s, true);
    return {};
  }
  if (action === "update") {
    if (!folder || folder === FAVORITES_FOLDER_ID) {
      throw { code: "denied", message: "default favorites folder cannot be renamed" };
    }
    const existing = await jfFetch(
      s.serverURL,
      "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(folder),
      { deviceId: s.deviceId, token: s.accessToken }
    );
    existing.Name = title;
    await jfFetch(s.serverURL, "/Items/" + encodeURIComponent(folder), {
      method: "POST",
      deviceId: s.deviceId,
      token: s.accessToken,
      body: existing,
    });
    userDataGen(s, true);
    return {};
  }
  if (action === "delete") {
    if (!folder || folder === FAVORITES_FOLDER_ID) {
      throw { code: "denied", message: "default favorites folder cannot be deleted" };
    }
    await jfFetch(s.serverURL, "/Items/" + encodeURIComponent(folder), {
      method: "DELETE",
      deviceId: s.deviceId,
      token: s.accessToken,
    });
    userDataGen(s, true);
    return {};
  }
  if (action === "remove") {
    if (folder === FAVORITES_FOLDER_ID) {
      for (let i = 0; i < resources.length; i++) {
        const id = String(resources[i] || "").trim();
        if (!id) continue;
        await jfFetch(
          s.serverURL,
          "/Users/" + encodeURIComponent(s.userId) + "/FavoriteItems/" + encodeURIComponent(id),
          { method: "DELETE", deviceId: s.deviceId, token: s.accessToken }
        );
      }
    } else if (folder && resources.length > 0) {
      await jfFetch(
        s.serverURL,
        "/Playlists/" + encodeURIComponent(folder) + "/Items" + qs({ EntryIds: resources.join(",") }),
        { method: "DELETE", deviceId: s.deviceId, token: s.accessToken }
      );
    }
    userDataGen(s, true);
    return {};
  }
  throw { code: "unsupported", message: "unsupported folder action: " + action };
}

const ORIGINAL_QUALITY_ID = "original";
const ORIGINAL_MAX_BITRATE = 200000000;

// Descending transcoding presets (highest -> lowest) aligned with MikuTV's
// adaptive quality ladder. Filtered per item against the source's actual
// resolution and bitrate so tiers above the source are never shown.
const QUALITY_PRESETS = [
  { id: "4k-40m", label: "4K · 40 Mbps", badge: "4K", tier: 2160, maxWidth: 3840, maxHeight: 2160, bitrate: 40000000 },
  { id: "1080p-20m", label: "1080p · 20 Mbps", badge: "1080p", tier: 1080, maxWidth: 1920, maxHeight: 1080, bitrate: 20000000 },
  { id: "1080p-10m", label: "1080p · 10 Mbps", badge: "1080p", tier: 1080, maxWidth: 1920, maxHeight: 1080, bitrate: 10000000 },
  { id: "720p-4m", label: "720p · 4 Mbps", badge: "720p", tier: 720, maxWidth: 1280, maxHeight: 720, bitrate: 4000000 },
  { id: "480p-2m", label: "480p · 2 Mbps", badge: "480p", tier: 480, maxWidth: 854, maxHeight: 480, bitrate: 2000000 },
];

function findQualityPreset(id) {
  const clean = String(id || "").trim();
  for (let i = 0; i < QUALITY_PRESETS.length; i++) {
    if (QUALITY_PRESETS[i].id === clean) return QUALITY_PRESETS[i];
  }
  return null;
}

function resolutionTier(width, height) {
  if (width >= 3400 || height >= 1900) return 2160;
  if (width >= 1700 || height >= 950) return 1080;
  if (width >= 1100 || height >= 650) return 720;
  if (width > 0 || height > 0) return 480;
  return 0;
}

function defaultBandwidthForTier(tier) {
  if (tier >= 2160) return 45000000;
  if (tier >= 1080) return 12000000;
  if (tier >= 720) return 5000000;
  return 2500000;
}

function inspectSourceVideo(ms, fallbackItem) {
  const candidates = [];
  if (ms && typeof ms === "object") candidates.push(ms);
  const metaSources = fallbackItem && Array.isArray(fallbackItem.MediaSources) ? fallbackItem.MediaSources : [];
  for (let i = 0; i < metaSources.length; i++) {
    if (metaSources[i] && typeof metaSources[i] === "object") candidates.push(metaSources[i]);
  }
  let width = 0;
  let height = 0;
  let hdr = false;
  let bitrate = 0;
  for (let i = 0; i < candidates.length; i++) {
    const src = candidates[i];
    if (!bitrate && Number(src.Bitrate) > 0) bitrate = Math.floor(Number(src.Bitrate));
    const streams = Array.isArray(src.MediaStreams) ? src.MediaStreams : [];
    for (let j = 0; j < streams.length; j++) {
      const st = streams[j];
      if (!st || st.Type !== "Video") continue;
      if (!width && Number(st.Width) > 0) width = Math.floor(Number(st.Width));
      if (!height && Number(st.Height) > 0) height = Math.floor(Number(st.Height));
      if (!bitrate && Number(st.BitRate) > 0) bitrate = Math.floor(Number(st.BitRate));
      if (
        st.VideoRange === "HDR" ||
        st.VideoRangeType === "HDR10" ||
        st.VideoRangeType === "HDR10Plus" ||
        st.VideoRangeType === "HLG" ||
        st.VideoRangeType === "DOVI" ||
        st.VideoRangeType === "DOVIWithHDR10"
      ) {
        hdr = true;
      }
      break;
    }
    if (width || height) break;
  }
  const tier = resolutionTier(width, height);
  const badge = videoQualityBadge(ms ? { MediaSources: [ms] } : fallbackItem) || videoQualityBadge(fallbackItem);
  return {
    width,
    height,
    tier,
    hdr,
    bitrate,
    badge,
    bandwidth: bitrate > 0 ? bitrate : defaultBandwidthForTier(tier),
  };
}

function buildQualityOptions(sourceInfo, copy, allowAutoBandwidth) {
  const autoBW = allowAutoBandwidth === undefined ? hasHostFeature("autoQualityUnderfed") : Boolean(allowAutoBandwidth);
  const lower = [];
  for (let i = 0; i < QUALITY_PRESETS.length; i++) {
    const p = QUALITY_PRESETS[i];
    if (sourceInfo.tier === 0) {
      // Unknown resolution: only offer presets strictly below known source bitrate.
      if (!(sourceInfo.bitrate > p.bitrate * 1.15)) continue;
    } else {
      // Never offer presets above the source resolution tier.
      if (p.tier > sourceInfo.tier) continue;
      if (p.tier === sourceInfo.tier) {
        // Same resolution tier: only offer if it meaningfully reduces bitrate.
        if (!(sourceInfo.bitrate > p.bitrate * 1.15)) continue;
      } else {
        // Strictly lower resolution tier: skip if source bitrate is already at or below preset.
        if (sourceInfo.bitrate > 0 && p.bitrate >= sourceInfo.bitrate) continue;
      }
    }
    const opt = {
      id: p.id,
      label: p.label,
      badge: p.badge,
      hdr: false,
    };
    // Older MikuTV hosts (v0.1.6/v0.1.7) without autoQualityUnderfed can falsely
    // auto-downgrade fast-LAN SDR playback when lower tiers carry bandwidth.
    // Leaving bandwidth unset on lower presets preserves manual selection and
    // preferredQuality while keeping auto-quality safely on Original on older hosts.
    if (autoBW) {
      opt.bandwidth = p.bitrate;
    }
    lower.push(opt);
  }
  let origBandwidth = sourceInfo.bandwidth > 0 ? sourceInfo.bandwidth : 2500000;
  if (lower.length > 0 && lower[0].bandwidth > 0 && origBandwidth <= lower[0].bandwidth) {
    origBandwidth = lower[0].bandwidth + 1000000;
  }
  const origLabel = sourceInfo.badge ? `${sourceInfo.badge} · ${copy.originalQuality}` : copy.originalQuality;
  const original = {
    id: ORIGINAL_QUALITY_ID,
    label: origLabel,
    badge: sourceInfo.badge || "",
    hdr: Boolean(sourceInfo.hdr),
    bandwidth: origBandwidth,
  };
  return [original].concat(lower);
}

function selectPreferredPreset(preferredQuality, sourceInfo, copy) {
  const pref = String(preferredQuality || "").trim();
  if (!pref || pref === "4k-hdr" || pref === "4k") return null;
  const maxTier = pref === "1080p" ? 1080 : pref === "720p" ? 720 : 0;
  if (!maxTier) return null;
  // Do not force transcoding if source is already at or below the preferred resolution.
  if (sourceInfo.tier > 0 && sourceInfo.tier <= maxTier) return null;
  const options = buildQualityOptions(sourceInfo, copy, true);
  for (let i = 0; i < options.length; i++) {
    const preset = findQualityPreset(options[i].id);
    if (preset && preset.tier <= maxTier) return preset;
  }
  return null;
}

function appleTVDeviceProfile(hevc, preset) {
  const videoCodecs = hevc !== false ? "hevc,h264" : "h264";
  const maxBitrate = preset ? preset.bitrate : ORIGINAL_MAX_BITRATE;
  const transcodingProfile = {
    Container: "mp4",
    Type: "Video",
    VideoCodec: videoCodecs,
    AudioCodec: "aac,ac3,eac3",
    Protocol: "hls",
    Context: "Streaming",
    BreakOnNonKeyFrames: false,
    SegmentLength: 6,
    MinSegments: 2,
    CopyTimestamps: true,
  };
  const codecProfiles = [
    {
      Type: "Video",
      Codec: "hevc",
      Container: "mp4,m4v,mov",
      Conditions: [
        {
          Condition: "EqualsAny",
          Property: "VideoCodecTag",
          Value: "hvc1|dvh1|dvhe",
          IsRequired: false,
        },
      ],
    },
  ];
  if (preset) {
    const resolutionConditions = [
      {
        Condition: "LessThanEqual",
        Property: "Width",
        Value: String(preset.maxWidth),
        IsRequired: false,
      },
      {
        Condition: "LessThanEqual",
        Property: "Height",
        Value: String(preset.maxHeight),
        IsRequired: false,
      },
    ];
    transcodingProfile.Conditions = resolutionConditions;
    codecProfiles.push({
      Type: "Video",
      Conditions: resolutionConditions,
    });
  }
  return {
    Name: "MikuTV Apple TV",
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: maxBitrate,
    DirectPlayProfiles: [
      {
        Container: "mp4,m4v,mov",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3,ac3,eac3,alac,flac",
      },
    ],
    TranscodingProfiles: [transcodingProfile],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "srt", Method: "External" },
      { Format: "subrip", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
      { Format: "pgssub", Method: "Drop" },
      { Format: "dvdsub", Method: "Drop" },
      { Format: "dvbsub", Method: "Drop" },
      { Format: "pgs", Method: "Drop" },
    ],
  };
}

function ensureQueryToken(fullURL, token) {
  if (!fullURL) return "";
  if (/[?&](api_key|ApiKey)=/i.test(fullURL)) return fullURL;
  return fullURL + (fullURL.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + encodeURIComponent(token);
}

// Strip server-side subtitle burn-in parameters from Jellyfin HLS URLs.
// Text subtitles are delivered externally as WebVTT via readSubtitles, while
// Blu-ray PGS subtitles are rendered natively client-side by MikuTV so video
// remains lossless stream copy instead of forcing CPU burn-in.
function stripSubtitleBurnIn(rawURL) {
  if (!rawURL) return "";
  const qIdx = rawURL.indexOf("?");
  if (qIdx < 0) return rawURL;
  const base = rawURL.slice(0, qIdx);
  const parts = rawURL.slice(qIdx + 1).split("&");
  const kept = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    const key = (eqIdx >= 0 ? part.slice(0, eqIdx) : part).toLowerCase();
    if (
      key === "subtitlestreamindex" ||
      key === "subtitlemethod" ||
      key === "subtitlecodec" ||
      key === "alwaysburninsubtitlewhentranscoding"
    ) {
      continue;
    }
    kept.push(part);
  }
  return kept.length > 0 ? base + "?" + kept.join("&") : base;
}

function parseAudioTrackIndex(raw) {
  const clean = String(raw || "").trim();
  if (!clean) return null;
  const m = clean.match(/^(?:audio-)?(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function extractAudioTracks(mediaStreams, copy) {
  const tracks = [];
  let counter = 1;
  for (let i = 0; i < mediaStreams.length; i++) {
    const st = mediaStreams[i];
    if (!st || st.Type !== "Audio") continue;
    const idx = st.Index != null ? Number(st.Index) : i;
    if (!Number.isFinite(idx) || idx < 0) continue;
    const parts = [];
    if (st.DisplayTitle) {
      parts.push(String(st.DisplayTitle).trim());
    } else {
      if (st.Title) parts.push(String(st.Title).trim());
      if (st.Language) parts.push(String(st.Language).trim());
      if (st.Codec) parts.push(String(st.Codec).toUpperCase().trim());
      if (st.ChannelLayout) parts.push(String(st.ChannelLayout).trim());
    }
    const label = (parts.filter(Boolean).join(" · ") || copy.audioTrack(counter)).slice(0, 128);
    const track = {
      id: "audio-" + idx,
      label,
      language: String(st.Language || "").trim().slice(0, 64),
      codec: String(st.Codec || "").toLowerCase().trim().slice(0, 64),
      default: Boolean(st.IsDefault),
      index: idx,
    };
    const bw = Math.floor(Number(st.BitRate || 0));
    if (bw > 0) track.bandwidth = bw;
    tracks.push(track);
    counter++;
  }
  return tracks;
}

function isPGSSubtitleStream(st) {
  const codec = String((st && st.Codec) || "").toLowerCase().trim();
  return codec === "pgssub" || codec === "pgs" || codec === "hdmv_pgs_subtitle";
}

function buildChapters(s, playId, itemMeta, copy) {
  const raw = itemMeta && Array.isArray(itemMeta.Chapters) ? itemMeta.Chapters : [];
  if (raw.length === 0) return [];
  const chapters = [];
  let lastStart = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!ch || typeof ch !== "object") continue;
    const ticks = Number(ch.StartPositionTicks);
    if (!Number.isFinite(ticks) || ticks < 0) continue;
    const start = Math.round((ticks / TICKS_PER_SECOND) * 1000) / 1000;
    if (start <= lastStart) continue;
    lastStart = start;
    const title = String(ch.Name || "").trim() || copy.chapterTitle(chapters.length + 1);
    const entry = { title, start };
    if (ch.ImageTag) {
      entry.imageURL =
        s.serverURL +
        "/Items/" +
        encodeURIComponent(playId) +
        "/Images/Chapter/" +
        i +
        qs({ tag: ch.ImageTag, maxWidth: 480, quality: 85, api_key: s.accessToken });
    }
    chapters.push(entry);
  }
  return chapters;
}

function buildThumbnails(s, playId, msId, itemMeta) {
  const tp = itemMeta && itemMeta.Trickplay;
  if (!tp || typeof tp !== "object") return null;
  let byWidth = tp[msId];
  if (!byWidth || typeof byWidth !== "object") {
    const keys = Object.keys(tp);
    if (keys.length === 0) return null;
    byWidth = tp[keys[0]];
  }
  if (!byWidth || typeof byWidth !== "object") return null;
  const widthKeys = Object.keys(byWidth)
    .map((k) => ({ key: k, width: parseInt(k, 10) || 0, info: byWidth[k] }))
    .filter((entry) => entry.info && typeof entry.info === "object" && entry.width > 0)
    .sort((a, b) => a.width - b.width);
  if (widthKeys.length === 0) return null;
  let chosen = widthKeys.find((e) => e.width === 320);
  if (!chosen) {
    const under480 = widthKeys.filter((e) => e.width <= 480);
    chosen = under480.length > 0 ? under480[under480.length - 1] : widthKeys[0];
  }
  const info = chosen.info;
  const width = Math.floor(Number(info.Width || chosen.width));
  const height = Math.floor(Number(info.Height || 0));
  const columns = Math.floor(Number(info.TileWidth || 0));
  const rows = Math.floor(Number(info.TileHeight || 0));
  const count = Math.floor(Number(info.ThumbnailCount || 0));
  const intervalMs = Number(info.Interval || 0);
  if (width < 1 || height < 1 || columns < 1 || rows < 1 || count < 1 || !(intervalMs > 0)) {
    return null;
  }
  const perSheet = columns * rows;
  const sheetCount = Math.ceil(count / perSheet);
  if (sheetCount < 1 || sheetCount > 240) return null;
  const images = [];
  for (let i = 0; i < sheetCount; i++) {
    images.push(
      s.serverURL +
        "/Videos/" +
        encodeURIComponent(playId) +
        "/Trickplay/" +
        width +
        "/" +
        i +
        ".jpg" +
        qs({ mediaSourceId: msId, api_key: s.accessToken })
    );
  }
  const times = [];
  for (let i = 0; i < count; i++) {
    times.push((i * intervalMs) / 1000);
  }
  return { images, times, columns, rows, width, height };
}

const TTL_PLAY_SESSION = 21600;

function playSessionKey(s, itemId) {
  return hasCache() ? CACHE_PREFIX + "playsess:" + cacheScope(s) + "|" + itemId : "";
}

function requestPlaybackInfo(s, playId, hevc, mediaSourceId, preset, audioStreamIndex, disableDirectPlay) {
  const body = {
    UserId: s.userId,
    MaxStreamingBitrate: preset ? preset.bitrate : ORIGINAL_MAX_BITRATE,
    DeviceProfile: appleTVDeviceProfile(hevc, preset),
    AutoOpenLiveStream: true,
    SubtitleStreamIndex: -1,
    AlwaysBurnInSubtitleWhenTranscoding: false,
  };
  if (mediaSourceId) {
    body.MediaSourceId = mediaSourceId;
  }
  if (audioStreamIndex != null) {
    body.AudioStreamIndex = audioStreamIndex;
  }
  if (disableDirectPlay) {
    body.EnableDirectPlay = false;
    body.EnableDirectStream = true;
    body.EnableTranscoding = true;
  }
  return jfFetch(s.serverURL, "/Items/" + encodeURIComponent(playId) + "/PlaybackInfo" + qs({ UserId: s.userId }), {
    method: "POST",
    deviceId: s.deviceId,
    token: s.accessToken,
    body,
  });
}

function pickMediaSource(resp, msId) {
  const list = (resp && Array.isArray(resp.MediaSources)) ? resp.MediaSources : [];
  if (list.length === 0) return null;
  if (msId) {
    const matched = list.find((src) => String((src && src.Id) || "").toLowerCase() === msId.toLowerCase());
    if (matched) return matched;
  }
  return list[0];
}

export async function resolvePlayback(req) {
  const s = requireSecret(req && req.secret);
  const copy = t();
  const ref = (req && req.ref) || {};
  let playId = String((req && req.partID) || "").trim();
  let episodes = [];

  if (!playId) {
    if (ref.kind === "series") {
      // Try Next Up first, then fall back to first episode.
      const [nextUpResp, eps] = await Promise.all([
        jfFetch(
          s.serverURL,
          "/Shows/NextUp" + qs({ UserId: s.userId, SeriesId: ref.id, Limit: 1 }),
          { deviceId: s.deviceId, token: s.accessToken }
        ).catch(() => ({ Items: [] })),
        fetchSeriesEpisodes(s, ref.id).catch(() => []),
      ]);
      episodes = eps;
      const nextUp = nextUpResp && Array.isArray(nextUpResp.Items) && nextUpResp.Items[0];
      if (nextUp && nextUp.Id) {
        playId = String(nextUp.Id);
      } else if (eps.length > 0) {
        playId = eps[0].partID;
      } else {
        throw { code: "plugin", message: "No playable episodes found in this series." };
      }
    } else {
      playId = String(ref.id || "");
    }
  } else if (ref.kind === "series") {
    episodes = await fetchSeriesEpisodes(s, ref.id).catch(() => []);
  }

  const reqQuality = String((req && req.quality) || "").trim();
  const prefQuality = String((req && req.preferredQuality) || "").trim();
  let requestedAudioIndex = parseAudioTrackIndex(req && req.audioTrack);
  let activePreset =
    reqQuality && reqQuality !== ORIGINAL_QUALITY_ID && reqQuality !== "auto"
      ? findQualityPreset(reqQuality)
      : null;

  let itemMeta = null;
  let playbackInfo = null;
  if (!reqQuality && (prefQuality === "1080p" || prefQuality === "720p")) {
    itemMeta = await fetchUserItem(s, playId).catch(() => null);
    if (itemMeta) {
      activePreset = selectPreferredPreset(prefQuality, inspectSourceVideo(null, itemMeta), copy);
    }
    playbackInfo = await requestPlaybackInfo(s, playId, req && req.hevc, playId, activePreset, requestedAudioIndex, false);
  } else {
    [itemMeta, playbackInfo] = await Promise.all([
      fetchUserItem(s, playId).catch(() => null),
      requestPlaybackInfo(s, playId, req && req.hevc, playId, activePreset, requestedAudioIndex, false),
    ]);
  }

  if (episodes.length === 0 && itemMeta && itemMeta.Type === "Episode" && itemMeta.SeriesId) {
    episodes = await fetchSeriesEpisodes(s, itemMeta.SeriesId).catch(() => []);
  }

  let ms = pickMediaSource(playbackInfo, "");
  if (!ms) {
    throw { code: "plugin", message: "No playable media sources returned by Jellyfin." };
  }
  let msId = String(ms.Id || playId);
  let playSessionId = String((playbackInfo && playbackInfo.PlaySessionId) || "").trim();

  // Validate requestedAudioIndex against actual audio streams on this media source.
  let audioEntries = extractAudioTracks(Array.isArray(ms.MediaStreams) ? ms.MediaStreams : [], copy);
  if (requestedAudioIndex != null && !audioEntries.some((a) => a.index === requestedAudioIndex)) {
    requestedAudioIndex = null;
  }

  const defaultAudioEntry = audioEntries.find((a) => a.default) || audioEntries[0] || null;
  const defaultAudioIndex =
    ms.DefaultAudioStreamIndex != null
      ? Number(ms.DefaultAudioStreamIndex)
      : defaultAudioEntry
        ? defaultAudioEntry.index
        : null;
  const needsRemuxForAudio =
    requestedAudioIndex != null &&
    ms.SupportsDirectPlay &&
    defaultAudioIndex != null &&
    requestedAudioIndex !== defaultAudioIndex;

  // Jellyfin MediaInfoHelper only applies SubtitleStreamIndex / AudioStreamIndex
  // when MediaSourceId matches the resolved media source ID, and Static DirectPlay
  // ignores AudioStreamIndex when switching away from the container's default track.
  if (needsRemuxForAudio || (msId && msId.toLowerCase() !== playId.toLowerCase() && !ms.SupportsDirectPlay)) {
    const refined = await requestPlaybackInfo(
      s,
      playId,
      req && req.hevc,
      msId,
      activePreset,
      requestedAudioIndex,
      needsRemuxForAudio
    ).catch(() => null);
    const matched = pickMediaSource(refined, msId);
    if (matched) {
      ms = matched;
      msId = String(ms.Id || msId);
      if (refined && refined.PlaySessionId) playSessionId = String(refined.PlaySessionId).trim();
    }
  }

  const sourceInfo = inspectSourceVideo(ms, itemMeta);

  // If preferredQuality was requested but itemMeta was unavailable before the
  // initial PlaybackInfo call, apply the preferred cap now using ms metadata.
  if (!reqQuality && !activePreset && (prefQuality === "1080p" || prefQuality === "720p")) {
    const deferred = selectPreferredPreset(prefQuality, sourceInfo, copy);
    if (deferred) {
      activePreset = deferred;
      const capped = await requestPlaybackInfo(
        s,
        playId,
        req && req.hevc,
        msId,
        activePreset,
        requestedAudioIndex,
        needsRemuxForAudio
      ).catch(() => null);
      const matched = pickMediaSource(capped, msId);
      if (matched) {
        ms = matched;
        msId = String(ms.Id || msId);
        if (capped && capped.PlaySessionId) playSessionId = String(capped.PlaySessionId).trim();
      }
    }
  }

  const qualities = buildQualityOptions(sourceInfo, copy);

  // If the requested preset is above or equal to this item's actual quality,
  // fall back to Original so we never expose or force upscaled/redundant tiers.
  if (activePreset && !qualities.some((q) => q.id === activePreset.id)) {
    activePreset = null;
    if (!ms.SupportsDirectPlay) {
      const origResp = await requestPlaybackInfo(
        s,
        playId,
        req && req.hevc,
        msId,
        null,
        requestedAudioIndex,
        needsRemuxForAudio
      ).catch(() => null);
      const matched = pickMediaSource(origResp, msId);
      if (matched) {
        ms = matched;
        msId = String(ms.Id || msId);
        if (origResp && origResp.PlaySessionId) playSessionId = String(origResp.PlaySessionId).trim();
      }
    }
  }

  const activeQualityId = activePreset ? activePreset.id : ORIGINAL_QUALITY_ID;
  const mediaStreams = Array.isArray(ms.MediaStreams) ? ms.MediaStreams : [];
  audioEntries = extractAudioTracks(mediaStreams, copy);
  const activeAudioEntry =
    (requestedAudioIndex != null && audioEntries.find((a) => a.index === requestedAudioIndex)) ||
    (ms.DefaultAudioStreamIndex != null && audioEntries.find((a) => a.index === Number(ms.DefaultAudioStreamIndex))) ||
    audioEntries.find((a) => a.default) ||
    audioEntries[0] ||
    null;
  const activeAudioIndex = activeAudioEntry ? activeAudioEntry.index : null;

  const containerParts = String(ms.Container || "mp4").toLowerCase().split(",").map((c) => c.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const container = containerParts.indexOf("mp4") >= 0 ? "mp4" : (containerParts[0] || "mp4");

  let streamFormat = "direct";
  let streamURL = "";
  let contentType = "video/mp4";
  let playMethod = "DirectPlay";

  if (ms.SupportsDirectPlay && !needsRemuxForAudio) {
    streamFormat = "direct";
    playMethod = "DirectPlay";
    streamURL =
      s.serverURL +
      "/Videos/" +
      encodeURIComponent(playId) +
      "/stream." +
      container +
      qs({ Static: "true", MediaSourceId: msId, api_key: s.accessToken });
    contentType = container === "mov" ? "video/quicktime" : "video/mp4";
  } else if (ms.TranscodingUrl) {
    streamFormat = "hls";
    playMethod = "Transcode";
    const rawTranscodeURL = ms.TranscodingUrl.startsWith("http")
      ? ms.TranscodingUrl
      : s.serverURL + ms.TranscodingUrl;
    streamURL = ensureQueryToken(stripSubtitleBurnIn(rawTranscodeURL), s.accessToken);
    contentType = "application/vnd.apple.mpegurl";
  } else {
    // Fallback to Jellyfin HLS master playlist.
    streamFormat = "hls";
    playMethod = "DirectStream";
    const fallbackParams = {
      MediaSourceId: msId,
      DeviceId: s.deviceId,
      VideoCodec: req && req.hevc === false ? "h264" : "hevc,h264",
      AudioCodec: "aac,ac3,eac3",
      SegmentContainer: "mp4",
      api_key: s.accessToken,
    };
    if (activeAudioIndex != null) {
      fallbackParams.AudioStreamIndex = activeAudioIndex;
    }
    if (activePreset) {
      fallbackParams.VideoBitrate = activePreset.bitrate;
      fallbackParams.MaxWidth = activePreset.maxWidth;
      fallbackParams.MaxHeight = activePreset.maxHeight;
    }
    streamURL =
      s.serverURL +
      "/Videos/" +
      encodeURIComponent(playId) +
      "/master.m3u8" +
      qs(fallbackParams);
    contentType = "application/vnd.apple.mpegurl";
  }

  // Extract text subtitles as WebVTT external tracks and Blu-ray PGS bitmap
  // subtitles when the host supports native client-side PGS decoding.
  const allowPGS = hasHostFeature("pgsSubtitles");
  const subtitles = [];
  let subCounter = 1;
  for (let i = 0; i < mediaStreams.length; i++) {
    const st = mediaStreams[i];
    if (!st || st.Type !== "Subtitle") continue;
    const subIdx = st.Index != null ? st.Index : i;
    const label = String(st.DisplayTitle || st.Title || st.Language || copy.subtitleTrack(subCounter)).trim().slice(0, 128);
    const language = String(st.Language || "").trim().slice(0, 64);
    if (st.IsTextSubtitleStream) {
      const subURL =
        s.serverURL +
        "/Videos/" +
        encodeURIComponent(playId) +
        "/" +
        encodeURIComponent(msId) +
        "/Subtitles/" +
        subIdx +
        "/0/Stream.vtt" +
        qs({ api_key: s.accessToken });
      subtitles.push({
        id: "sub-" + subIdx,
        label: label || copy.subtitleTrack(subCounter),
        language,
        default: Boolean(st.IsDefault),
        resource: { urls: [subURL] },
      });
      subCounter++;
    } else if (allowPGS && isPGSSubtitleStream(st)) {
      const subURL =
        s.serverURL +
        "/Videos/" +
        encodeURIComponent(playId) +
        "/" +
        encodeURIComponent(msId) +
        "/Subtitles/" +
        subIdx +
        "/0/Stream.pgssub" +
        qs({ api_key: s.accessToken });
      subtitles.push({
        id: "sub-" + subIdx,
        label: label || copy.subtitleTrack(subCounter),
        language,
        codec: "pgssub",
        contentType: "application/x-pgs",
        default: Boolean(st.IsDefault),
        resource: { urls: [subURL] },
      });
      subCounter++;
    }
  }

  const durationTicks = Number((itemMeta && itemMeta.RunTimeTicks) || ms.RunTimeTicks || 0);
  const duration = Number(ticksToSeconds(durationTicks) || 0);
  const resumeTicks = Number((itemMeta && itemMeta.UserData && itemMeta.UserData.PlaybackPositionTicks) || 0);
  const resumeSeconds = Number(ticksToSeconds(resumeTicks) || 0);
  const chapters = buildChapters(s, playId, itemMeta, copy);
  const thumbnails = buildThumbnails(s, playId, msId, itemMeta);

  // Cache play session metadata without firing /Sessions/Playing yet so hover
  // inline-previews never pollute Jellyfin active sessions or watch history.
  // reportPlayback fires /Sessions/Playing lazily on the first real playback report.
  const sessKey = playSessionKey(s, playId);
  if (sessKey) {
    cacheSetJSON(
      sessKey,
      {
        itemId: playId,
        mediaSourceId: msId,
        playSessionId,
        playMethod,
        durationTicks,
        audioStreamIndex: activeAudioIndex,
        started: false,
      },
      TTL_PLAY_SESSION
    );
  }

  const plan = {
    itemID: playId,
    duration,
    resumeSeconds: duration > 0 && resumeSeconds < duration - 5 ? resumeSeconds : 0,
    access: "granted",
    quality: activeQualityId,
    qualities,
    streams: [
      {
        format: streamFormat,
        video: {
          resource: { urls: [streamURL] },
          contentType,
        },
      },
    ],
    subtitles,
    episodes,
  };
  if (hasHostFeature("planAudioTracks") && audioEntries.length > 0 && activeAudioEntry) {
    plan.audioTrack = activeAudioEntry.id;
    plan.audioTracks = audioEntries.map((a) => {
      const out = {
        id: a.id,
        label: a.label,
        language: a.language,
        codec: a.codec,
        default: a.default,
      };
      if (a.bandwidth > 0) out.bandwidth = a.bandwidth;
      return out;
    });
  }
  if (chapters.length > 0) {
    plan.chapters = chapters;
  }
  if (thumbnails) {
    plan.thumbnails = thumbnails;
  }
  if (req && req.partID) {
    plan.partID = String(req.partID);
  } else if (ref.kind === "series" && playId) {
    plan.partID = playId;
  }
  return plan;
}

function parseVTTTimestamp(raw) {
  const clean = String(raw || "").trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
  }
  return NaN;
}

function parseWebVTT(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues = [];
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    let timeIdx = -1;
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].indexOf("-->") >= 0) {
        timeIdx = j;
        break;
      }
    }
    if (timeIdx < 0 || timeIdx + 1 >= lines.length) continue;
    const arrowParts = lines[timeIdx].split("-->");
    const start = parseVTTTimestamp(arrowParts[0]);
    const end = parseVTTTimestamp((arrowParts[1] || "").trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
    const body = lines
      .slice(timeIdx + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .trim();
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues;
}

export async function readSubtitles(req) {
  const s = requireSecret(req && req.secret);
  const track = (req && req.track) || {};
  const urls = track.resource && Array.isArray(track.resource.urls) ? track.resource.urls : [];
  if (urls.length === 0) return { cues: [] };
  const codec = String(track.codec || "").toLowerCase().trim();
  const contentType = String(track.contentType || "").toLowerCase().trim();
  if (codec === "pgssub" || codec === "pgs" || contentType === "application/x-pgs" || /\.pgssub(\?|$)/i.test(urls[0])) {
    return { cues: [] };
  }
  let resp;
  try {
    resp = await fetch(urls[0], {
      headers: {
        Authorization: authHeader(s.deviceId, s.accessToken),
      },
    });
  } catch (err) {
    throw { code: "network", message: String((err && err.message) || err || "subtitle fetch failed") };
  }
  if (!resp.ok) {
    throw { code: "network", message: "Subtitle HTTP " + resp.status };
  }
  const vtt = await resp.text();
  return { cues: parseWebVTT(vtt) };
}

export async function reportPlayback(req) {
  const s = requireSecret(req && req.secret);
  const data = (req && req.data) || {};
  const itemId = String(data.itemID || data.partID || (data.ref && data.ref.id) || "").trim();
  if (!itemId) return {};
  const sessKey = playSessionKey(s, itemId);
  const sess = sessKey ? cacheGetJSON(sessKey) : null;
  let ticks = Math.max(0, Math.floor(Number(data.seconds || 0) * TICKS_PER_SECOND));
  const finished = Boolean(data.finished);
  const stopped = Boolean(data.stopped);
  if (finished && sess && sess.durationTicks > 0 && ticks < sess.durationTicks) {
    ticks = sess.durationTicks;
  }

  const body = {
    ItemId: itemId,
    PositionTicks: ticks,
    IsPaused: false,
    CanSeek: true,
  };
  if (sess) {
    if (sess.mediaSourceId) body.MediaSourceId = sess.mediaSourceId;
    if (sess.playSessionId) body.PlaySessionId = sess.playSessionId;
    if (sess.playMethod) body.PlayMethod = sess.playMethod;
    if (sess.audioStreamIndex != null) body.AudioStreamIndex = sess.audioStreamIndex;
  }

  if (!sess || !sess.started) {
    try {
      await jfFetch(s.serverURL, "/Sessions/Playing", {
        method: "POST",
        deviceId: s.deviceId,
        token: s.accessToken,
        body,
      });
    } catch (_) {}
    if (sessKey && sess) {
      sess.started = true;
      cacheSetJSON(sessKey, sess, TTL_PLAY_SESSION);
    }
  }

  if (finished || stopped) {
    try {
      await jfFetch(s.serverURL, "/Sessions/Playing/Stopped", {
        method: "POST",
        deviceId: s.deviceId,
        token: s.accessToken,
        body,
      });
    } catch (_) {}
    if (finished) {
      try {
        await jfFetch(
          s.serverURL,
          "/Users/" + encodeURIComponent(s.userId) + "/PlayedItems/" + encodeURIComponent(itemId),
          {
            method: "POST",
            deviceId: s.deviceId,
            token: s.accessToken,
          }
        );
      } catch (_) {}
    }
    if (sessKey && hasCache() && typeof host.cache.delete === "function") {
      try {
        host.cache.delete(sessKey);
      } catch (_) {}
    }
  } else {
    try {
      await jfFetch(s.serverURL, "/Sessions/Playing/Progress", {
        method: "POST",
        deviceId: s.deviceId,
        token: s.accessToken,
        body,
      });
    } catch (_) {}
  }

  // Progress changes UserData on this item, its series and any list showing it.
  userDataGen(s, true);
  return {};
}
