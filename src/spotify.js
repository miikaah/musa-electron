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

const fetchSpotifyTokens = async (event, codeOrToken, grantType) => {
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
  event.sender.send("gotSpotifyTokens", tokens, tokens.refreshToken);
};

const SPOTIFY_PLAYER_BASE = "https://api.spotify.com/v1/me/player";

const dispatchPlayerAction = async (method, token) => {
  const res = await fetch(`${SPOTIFY_PLAYER_BASE}/${method}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    console.error(`Spotify ${method} failed`, res);
    return;
  }
};

const play = (event, token) => dispatchPlayerAction("play", token);
const pause = (event, token) => dispatchPlayerAction("pause", token);

module.exports = {
  fetchSpotifyTokens,
  play,
  pause
};
