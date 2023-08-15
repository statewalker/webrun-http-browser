export function splitServiceUrl(url, separator = "~") {
  let key = "";
  let path = "";
  let str = url + "";
  const idx = str.indexOf(separator);
  let baseUrl = "";
  if (idx >= 0) {
    baseUrl = str.substring(0, idx + separator.length);
    str.substring(idx + separator.length)
      .replace(/^([^\/]+)/, (match, $1) => {
        baseUrl += match;
        if (baseUrl.length < str.length) baseUrl += "/";
        key = $1;
        path = str.substring(baseUrl.length);
        return "";
      });
  }
  return {
    url,
    key,
    baseUrl,
    path,
  };
}
