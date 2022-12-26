import { handleStreams, sendStream } from "./data-channels.js";
import { toReadableStream, fromReadableStream } from "./readable-streams.js";

export function handleHttpRequests(communicationPort, handler) {
  return handleStreams(communicationPort, async function* (it) {
    try {
      const { done, value } = await it.next();
      let responseOptions = {};
      let responseBody = null;
      if (done) {
        responseOptions = { status: 404 };
      } else {
        let requestBody = undefined;
        const { url, mode, ...requestOptions } = value;
        delete value.mode;
        if (
          requestOptions.method !== "GET" &&
          requestOptions.method !== "HEAD" &&
          requestOptions.method !== "OPTIONS"
        ) {
          requestBody = toReadableStream(it);
          requestOptions.duplex = "half";
        } else if (it && it.return) {
          it.return();
        }
        const request = new Request(url, {
          ...requestOptions,
          // duplex: 'full',
          body: requestBody,
        });
        const response = await handler(request);
        console.log("[handleHttpRequests]", requestOptions.method, url, response);

        responseOptions = {
          status: response.status,
          statusTet: response.statusText,
          headers: Object.fromEntries([...response.headers]),
        };
        responseBody = await fromReadableStream(await response.body);
      }
      yield responseOptions;
      if (responseBody) yield* responseBody;
    } finally {
      if (it.return) it.return();
    }
  });
}

export async function sendHttpRequest(communicationPort, request) {
  const fields = [
    "url",
    "method",
    "mode",
    "credentials",
    "cache",
    "redirect",
    "referrer",
    "referrerPolicy",
    "integrity",
    "keepalive",
  ];
  // request = await request.clone();
  const requestOptions = fields.reduce((options, key) => {
    const val = request[key];
    if (val !== undefined) options[key] = val;
    return options;
  }, {});
  const input = (async function* () {
    yield requestOptions;
    if (request.body) yield* fromReadableStream(request.body);
  })();
  const it = sendStream(communicationPort, input);
  const { done, value: responseOptions } = await it.next();
  if (done) {
    it.return(); // Not neccessery
    return new Response(null, {
      status : 404,
      statusText : "Error 404: Not Found"
    })
  } else {
    let responseBody = null;
    if (
      requestOptions.method !== "HEAD" &&
      requestOptions.method !== "OPTIONS") {
      responseBody = toReadableStream(it);
    } else {
      it.return();
    }
    return new Response(responseBody, responseOptions);
  }
}
