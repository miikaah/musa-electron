const UrlSafeBase64 = require("urlsafe-base64");

const encode = (s) => {
  return UrlSafeBase64.encode(Buffer.from(s));
};

const decode = (s) => {
  return UrlSafeBase64.decode(s).toString("utf-8");
};

module.exports = {
  encode,
  decode,
};
