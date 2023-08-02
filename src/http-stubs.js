import { fromReadableStream, toReadableStream } from "./readable-streams.js";

/**
 * This method returns an HTTP handlers transforming
 * HTTP Request instances to binary representations and
 * sending them to a transport layer.
 * Results of these transport ivokations are deserialized
 * as meaningful Response instances and returned back to the caller.
 *
 * The specified `send` method is used to dispatch serialized
 * requests to return the serialized remote results.
 * This transport method accepts and returns objects with
 * the same structure:
 * * `options` - contains serialized request or response parameters
 * * `content` - an async iterator over binary blocks for
 *    the request or response
 *
 * @param {*} send transport function accepting serialized requests
 * and returning back serialized responses
 * @returns an async handler accepting standard
 *   HTTP `Request` instances and returning `Response` instances
 */
export function newHttpClientStub(send) {
  return async (request) => {
    request = await request;
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
    const requestContent = (request.body)
      ? fromReadableStream(request.body)
      : [];
    const result = await send({
      options: requestOptions,
      content: requestContent,
    });
    let responseBody = null;
    let responseOptions = {};
    if (!result) {
      responseOptions = {
        status: 404,
        statusText: "Error 404: Not Found",
      };
    } else {
      responseOptions = result.options;
      const responseContent = result.content;
      if (
        requestOptions.method !== "HEAD" &&
        requestOptions.method !== "OPTIONS"
      ) {
        responseBody = toReadableStream(responseContent);
      } else if (responseContent && responseContent.return) {
        responseContent.return();
      }
    }
    return new Response(responseBody, responseOptions);
  };
}

/**
 * This method returns the server-side call handler transforming
 * serialized requests to HTTP Request instances, delegating
 * their handing to the given `handler` method. This handler
 * should handle the HTTP request and return a valid Response instance.
 * The resulting instance is serialized as an object with the same
 * structure as the initial serialized request:
 * - `options` - contains serialized request or response parameters
 * - `content` - an async iterator over binary blocks for
 *    the request or response
 * @param {*} handler this handler method accepts standard HTTP Request
 * and returns back an HTTP Response instance
 * @returns a method deserializing HTTP requests and returning back
 * serialized HTTP responses
 */
export function newHttpServerStub(handler) {
  return async (params) => {
    const {
      options: requestOptions,
      content: requestContent,
    } = await params;
    let requestBody = undefined;
    const { url, mode } = requestOptions;
    delete requestOptions.mode;
    delete requestOptions.url;
    if (
      requestOptions.method !== "GET" &&
      requestOptions.method !== "HEAD" &&
      requestOptions.method !== "OPTIONS"
    ) {
      requestBody = toReadableStream(requestContent);
      requestOptions.duplex = "half";
    } else if (requestContent && requestContent.return) {
      requestContent.return();
    }
    const request = new Request(url, {
      ...requestOptions,
      // duplex: 'full',
      body: requestBody,
    });
    const response = await handler(request);
    const responseOptions = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries([...response.headers]),
    };
    const responseContent = await fromReadableStream(await response.body);
    return {
      options : responseOptions,
      content : responseContent
    };
  };
}
