import { handleStreams, sendStream } from "../core/data-channels.js";
import { newHttpClientStub, newHttpServerStub } from "./http-stubs.js";

async function* httpToIterator(params) {
  const { options, content } = await params;
  const encoder = new TextEncoder();
  yield encoder.encode(JSON.stringify(options));
  yield* content;
}

async function httpFromIterator(it) {
  it = await it;
  const { done, value } = await it.next();
  let options = {};
  if (!done && value) {
    const decoder = new TextDecoder();
    const str = decoder.decode(value);
    options = JSON.parse(str);
  }
  return {
    options,
    content: it,
  };
}

export function handleHttpRequests(communicationPort, handler) {
  const serverStub = newHttpServerStub(handler);
  return handleStreams(communicationPort, (it) => {
    return httpToIterator(serverStub(httpFromIterator(it)));
  });
}

export async function sendHttpRequest(communicationPort, request) {
  const clientStub = newHttpClientStub(async (req) => {
    return await httpFromIterator(
      sendStream(communicationPort, httpToIterator(req)),
    );
  });
  return await clientStub(request);
}
