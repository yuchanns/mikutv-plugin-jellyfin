// Official Jellyfin source plugin for MikuTV (Apache-2.0).
// Pure ES module running inside MikuTV's sandboxed moejs runtime.
// Connects strictly to the user-entered Jellyfin server origin.

const CLIENT_NAME = "MikuTV";
const CLIENT_DEVICE = "Apple TV";
const CLIENT_VERSION = "1.0.0";
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
    autoQuality: "原画 / 自动",
    subtitleTrack: (i) => `字幕 ${i}`,
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
    autoQuality: "オリジナル / 自動",
    subtitleTrack: (i) => `字幕 ${i}`,
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
    autoQuality: "Original / Auto",
    subtitleTrack: (i) => `Subtitle ${i}`,
  },
};

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
  const data = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Views", {
    deviceId: s.deviceId,
    token: s.accessToken,
  });
  return (data && Array.isArray(data.Items)) ? data.Items : [];
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
  const data = await jfFetch(
    s.serverURL,
    "/Shows/" +
      encodeURIComponent(seriesId) +
      "/Episodes" +
      qs({ UserId: s.userId, Fields: "Overview,MediaSources", Limit: 200 }),
    { deviceId: s.deviceId, token: s.accessToken }
  );
  const rawList = (data && Array.isArray(data.Items)) ? data.Items : [];
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

export async function getItem(req) {
  const s = requireSecret(req && req.secret);
  const id = String((req && (req.id || (req.ref && req.ref.id))) || "");
  if (!id) throw { code: "plugin", message: "missing item id" };

  const item = await jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(id), {
    deviceId: s.deviceId,
    token: s.accessToken,
  });
  if (!item || !item.Id) throw { code: "plugin", message: "item not found" };

  const mapped = mapMediaItem(s.serverURL, s.accessToken, item);
  const [segments, similarResp] = await Promise.all([
    item.Type === "Series"
      ? fetchSeriesEpisodes(s, item.Id).catch(() => [])
      : item.Type === "Episode" && item.SeriesId
        ? fetchSeriesEpisodes(s, item.SeriesId).catch(() => [])
        : Promise.resolve([]),
    jfFetch(
      s.serverURL,
      "/Items/" + encodeURIComponent(item.Id) + "/Similar" + qs({ UserId: s.userId, Limit: 12, Fields: ITEM_FIELDS }),
      { deviceId: s.deviceId, token: s.accessToken }
    ).catch(() => ({ Items: [] })),
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

export async function readAccount(req) {
  const s = requireSecret(req && req.secret);
  const section = String((req && req.section) || "");
  const startIndex = Math.max(0, parseInt(String((req && req.cursor) || "0"), 10) || 0);
  const limit = 24;

  let path = "";
  if (section === "history") {
    path =
      "/Users/" +
      encodeURIComponent(s.userId) +
      "/Items/Resume" +
      qs({ StartIndex: startIndex, Limit: limit, Recursive: "true", MediaTypes: "Video", Fields: ITEM_FIELDS });
  } else if (section === "favorites") {
    path =
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
      });
  } else {
    return { rows: [] };
  }

  const resp = await jfFetch(s.serverURL, path, { deviceId: s.deviceId, token: s.accessToken });
  const rawItems = (resp && Array.isArray(resp.Items)) ? resp.Items : [];
  const total = Number((resp && resp.TotalRecordCount) || rawItems.length);
  const rows = rawItems.map((it) => {
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
    if (media.durationSeconds !== undefined) row.durationSeconds = media.durationSeconds;
    if (media.progressSeconds !== undefined) row.progressSeconds = media.progressSeconds;
    if (it.UserData && it.UserData.LastPlayedDate) {
      const ts = Math.floor(Date.parse(it.UserData.LastPlayedDate) / 1000);
      if (ts > 0) row.time = ts;
    }
    return row;
  });
  const nextCursor = startIndex + rawItems.length < total ? String(startIndex + rawItems.length) : "";
  return { rows, total, nextCursor };
}

function appleTVDeviceProfile(hevc) {
  const videoCodecs = hevc !== false ? "hevc,h264" : "h264";
  return {
    Name: "MikuTV Apple TV",
    MaxStreamingBitrate: 120000000,
    MaxStaticBitrate: 120000000,
    DirectPlayProfiles: [
      {
        Container: "mp4,m4v,mov",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3,ac3,eac3,alac,flac",
      },
    ],
    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,ac3,eac3",
        Protocol: "hls",
        Context: "Streaming",
        BreakOnNonKeyFrames: true,
        SegmentLength: 6,
      },
    ],
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
    ],
  };
}

function ensureQueryToken(fullURL, token) {
  if (!fullURL) return "";
  if (/[?&](api_key|ApiKey)=/i.test(fullURL)) return fullURL;
  return fullURL + (fullURL.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + encodeURIComponent(token);
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

  const [itemMeta, playbackInfo] = await Promise.all([
    jfFetch(s.serverURL, "/Users/" + encodeURIComponent(s.userId) + "/Items/" + encodeURIComponent(playId), {
      deviceId: s.deviceId,
      token: s.accessToken,
    }).catch(() => null),
    jfFetch(s.serverURL, "/Items/" + encodeURIComponent(playId) + "/PlaybackInfo" + qs({ UserId: s.userId }), {
      method: "POST",
      deviceId: s.deviceId,
      token: s.accessToken,
      body: {
        UserId: s.userId,
        DeviceProfile: appleTVDeviceProfile(req && req.hevc),
        AutoOpenLiveStream: true,
      },
    }),
  ]);

  if (episodes.length === 0 && itemMeta && itemMeta.Type === "Episode" && itemMeta.SeriesId) {
    episodes = await fetchSeriesEpisodes(s, itemMeta.SeriesId).catch(() => []);
  }

  const sources = (playbackInfo && Array.isArray(playbackInfo.MediaSources)) ? playbackInfo.MediaSources : [];
  if (sources.length === 0) {
    throw { code: "plugin", message: "No playable media sources returned by Jellyfin." };
  }
  const ms = sources[0];
  const msId = String(ms.Id || playId);
  const containerParts = String(ms.Container || "mp4").toLowerCase().split(",").map((c) => c.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const container = containerParts.indexOf("mp4") >= 0 ? "mp4" : (containerParts[0] || "mp4");

  let streamFormat = "direct";
  let streamURL = "";
  let contentType = "video/mp4";

  if (ms.SupportsDirectPlay) {
    streamFormat = "direct";
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
    streamURL = ensureQueryToken(
      ms.TranscodingUrl.startsWith("http") ? ms.TranscodingUrl : s.serverURL + ms.TranscodingUrl,
      s.accessToken
    );
    contentType = "application/vnd.apple.mpegurl";
  } else {
    // Fallback to Jellyfin HLS master playlist.
    streamFormat = "hls";
    streamURL =
      s.serverURL +
      "/Videos/" +
      encodeURIComponent(playId) +
      "/master.m3u8" +
      qs({
        MediaSourceId: msId,
        DeviceId: s.deviceId,
        VideoCodec: "hevc,h264",
        AudioCodec: "aac,ac3,eac3",
        SegmentContainer: "mp4",
        api_key: s.accessToken,
      });
    contentType = "application/vnd.apple.mpegurl";
  }

  // Extract text subtitles as WebVTT external tracks.
  const subtitles = [];
  const mediaStreams = Array.isArray(ms.MediaStreams) ? ms.MediaStreams : [];
  let subCounter = 1;
  for (let i = 0; i < mediaStreams.length; i++) {
    const st = mediaStreams[i];
    if (st.Type !== "Subtitle") continue;
    if (!st.IsTextSubtitleStream) continue;
    const subIdx = st.Index != null ? st.Index : i;
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
    const label = String(st.DisplayTitle || st.Title || st.Language || copy.subtitleTrack(subCounter)).trim();
    subtitles.push({
      id: "sub-" + subIdx,
      label: label || copy.subtitleTrack(subCounter),
      language: String(st.Language || "").trim(),
      default: Boolean(st.IsDefault),
      resource: { urls: [subURL] },
    });
    subCounter++;
  }

  const badge = videoQualityBadge(itemMeta || { MediaSources: [ms] });
  const duration = Number(ticksToSeconds((itemMeta && itemMeta.RunTimeTicks) || ms.RunTimeTicks) || 0);
  const resumeSeconds = Number(ticksToSeconds(itemMeta && itemMeta.UserData && itemMeta.UserData.PlaybackPositionTicks) || 0);

  const plan = {
    itemID: playId,
    duration,
    resumeSeconds: duration > 0 && resumeSeconds < duration - 5 ? resumeSeconds : 0,
    access: "granted",
    quality: "auto",
    qualities: [
      {
        id: "auto",
        label: badge ? `${badge} · ${copy.autoQuality}` : copy.autoQuality,
        badge: badge || "",
      },
    ],
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
  if (req && req.partID) {
    plan.partID = String(req.partID);
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
  const urls = req && req.track && req.track.resource && Array.isArray(req.track.resource.urls)
    ? req.track.resource.urls
    : [];
  if (urls.length === 0) return { cues: [] };
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
  const ticks = Math.max(0, Math.floor(Number(data.seconds || 0) * TICKS_PER_SECOND));
  try {
    await jfFetch(s.serverURL, "/Sessions/Playing/Progress", {
      method: "POST",
      deviceId: s.deviceId,
      token: s.accessToken,
      body: {
        ItemId: itemId,
        PositionTicks: ticks,
        IsPaused: false,
      },
    });
  } catch (_) {}
  return {};
}
