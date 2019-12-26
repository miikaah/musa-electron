const fetch = require("node-fetch");
const { isUndefined, camelCase } = require("lodash");
const { URLSearchParams } = require("url");
const { mapKeysToCaseShallow, getUrl } = require("./util");

const SPOTIFY_SCOPES =
  "" +
  "user-modify-playback-state " +
  "user-read-playback-state " +
  "user-read-currently-playing " +
  "user-top-read " +
  "user-read-recently-played " +
  // + 'user-library-modify '
  "user-library-read " +
  // + 'user-follow-modify '
  // + 'user-follow-read '
  "playlist-read-private " +
  // + 'playlist-modify-public '
  // + 'playlist-modify-private '
  "playlist-read-collaborative " +
  "user-read-private";
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
const SPOTIFY_AUTH_BASE64 = Buffer.from(
  `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
).toString("base64");
const SPOTIFY_BASIC_AUTH_HEADER = `Basic ${SPOTIFY_AUTH_BASE64}`;
const SPOTIFY_AUTHORIZE_URL = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${getUrl()}&scope=${SPOTIFY_SCOPES}`;
const hasSpotifyCredentials =
  !isUndefined(SPOTIFY_CLIENT_ID) && !isUndefined(SPOTIFY_CLIENT_SECRET);

const fetchTokens = async (event, codeOrToken, grantType) => {
  // eslint-disable-next-line no-console
  console.log(`Fetching spotify tokens (grant type: ${grantType})`);
  const params = new URLSearchParams();
  params.append("grant_type", grantType);
  params.append("redirect_uri", getUrl());
  params.append(
    grantType === "authorization_code" ? "code" : "refresh_token",
    codeOrToken
  );

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: params,
    headers: {
      Authorization: SPOTIFY_BASIC_AUTH_HEADER
    }
  });

  if (!res.ok) {
    console.error("Spotify tokens fetch failed", res);
    return;
  }

  const result = await res.json();
  const tokens = mapKeysToCaseShallow(
    {
      ...result,
      expiresAt: new Date().getTime() + result.expires_in * 1000
    },
    camelCase
  );
  // eslint-disable-next-line no-console
  console.log("Got Spotify tokens");
  event.sender.send("GotSpotifyTokens", tokens, tokens.refreshToken);
  return tokens;
};

const refreshTokensAndRetry = async ({
  event,
  tokens,
  retries,
  callback,
  params
}) => {
  if (retries > 0) {
    event.sender.send("SpotifyNotWorking");
    return;
  }
  retries++;
  // eslint-disable-next-line no-console
  console.log(`Attempting spotify tokens refresh (times: ${retries})`);
  const newTokens = await fetchTokens(event, tokens.refresh, "refresh_token");
  const mergedTokens = {
    ...tokens,
    access: newTokens.accessToken
  };
  return callback(event, mergedTokens, retries, ...params);
};

const executeFetch = async (url, method, options) => {
  const res = await fetch(url, {
    method,
    body: JSON.stringify(options.body),
    headers: {
      Authorization: `Bearer ${options.tokens.access}`,
      "Content-Type": "application/json"
    }
  });

  // eslint-disable-next-line no-console
  console.log(res.status, new Date().toISOString(), url);

  if (!res.ok) {
    console.error(`Spotify ${method} failed`, res);
    if (res.status === 401) {
      return refreshTokensAndRetry(options);
    }
    return;
  }

  return res.status === 200 ? res.json() : res.text();
};

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const SPOTIFY_PLAYER = `${SPOTIFY_BASE}/me/player`;
const SPOTIFY_SEARCH = `${SPOTIFY_BASE}/search`;
const SPOTIFY_ALBUMS = `${SPOTIFY_BASE}/albums`;

const get = async (event, tokens, retries = 0, url) => {
  return executeFetch(url, "GET", {
    event,
    tokens,
    retries,
    callback: get,
    params: [url]
  });
};

const put = async (event, tokens, retries = 0, url, body) => {
  return executeFetch(url, "PUT", {
    event,
    tokens,
    retries,
    callback: put,
    params: [url],
    body
  });
};

const play = (tokens, item, event) =>
  put(event, tokens, 0, `${SPOTIFY_PLAYER}/play`, { uris: [item.uri] });
const pause = (tokens, event) =>
  put(event, tokens, 0, `${SPOTIFY_PLAYER}/pause`);

const search = async (tokens, query, event) => {
  if (!query) return;
  const fetchQuery = `?q="${query}"&limit=10&type=album,artist,track&market=from_token`;
  return get(event, tokens, 0, `${SPOTIFY_SEARCH}${fetchQuery}`);
};

const getAlbumsTracks = async (tokens, item, event) => {
  return get(event, tokens, 0, `${SPOTIFY_ALBUMS}/${item.id}/tracks`);
};

module.exports = {
  SPOTIFY_AUTHORIZE_URL,
  hasSpotifyCredentials,
  fetchTokens,
  play,
  pause,
  search,
  getAlbumsTracks
};
