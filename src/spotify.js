const fetch = require("node-fetch");
const { camelCase } = require("lodash");
const { URLSearchParams } = require("url");
const { mapKeysToCaseShallow } = require("./util");
const { getUrl } = require("./util");

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;

const SPOTIFY_AUTH_BASE64 = Buffer.from(
  `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
).toString("base64");
const SPOTIFY_BASIC_AUTH_HEADER = `Basic ${SPOTIFY_AUTH_BASE64}`;

let spotifyTokensCache;

const fetchSpotifyTokens = async (event, codeOrToken, grantType) => {
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
  spotifyTokensCache = { ...tokens };
  event.sender.send("gotSpotifyTokens", tokens, tokens.refreshToken);
};

let retries = 0;

const refreshTokensAndRetry = async (event, callback, params) => {
  if (!spotifyTokensCache || retries > 1) {
    retries = 0;
    event.sender.send("spotifyNotWorking");
    return;
  }
  retries++;
  console.log(`Attempting spotify tokens refresh (times: ${retries})`);
  console.log(spotifyTokensCache);
  await fetchSpotifyTokens(
    event,
    spotifyTokensCache.refreshToken,
    "refresh_token"
  );
  await callback(event, ...params);
};

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const SPOTIFY_PLAYER_BASE = `${SPOTIFY_BASE}/me/player`;

const dispatchPlayerAction = async (event, token, method) => {
  const res = await fetch(`${SPOTIFY_PLAYER_BASE}/${method}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    console.error(`Spotify ${method} failed`, res);
    if (res.status === 401) {
      await refreshTokensAndRetry(event, dispatchPlayerAction, [
        spotifyTokensCache.accessToken,
        method
      ]);
    }
    return;
  }
};

const play = (event, token) => dispatchPlayerAction(event, token, "play");
const pause = (event, token) => dispatchPlayerAction(event, token, "pause");

const SPOTIFY_SEARCH_BASE = `${SPOTIFY_BASE}/search`;

const search = async (event, token, query) => {
  if (!query) return;
  const fetchQuery = `?q="${query}"&limit=10&type=album,artist,track&market=from_token`;

  const res = await fetch(`${SPOTIFY_SEARCH_BASE}${fetchQuery}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  console.log(res.status, new Date().toISOString(), query);

  if (!res.ok) {
    console.error("Spotify search failed", res);
    if (res.status === 401) {
      await refreshTokensAndRetry(event, search, [
        spotifyTokensCache.accessToken,
        query
      ]);
    }
    return;
  }

  const result = await res.json();
  event.sender.send("gotSpotifySearchResults", result);
};

module.exports = {
  fetchSpotifyTokens,
  play,
  pause,
  search
};
