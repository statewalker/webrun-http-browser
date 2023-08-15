import expect from "expect.js";
import {
  fromReadableStream,
  toReadableStream,
} from "../src/http/readable-streams.js";
import {
  handleHttpRequests,
  sendHttpRequest,
} from "../src/http/http-send-recieve.js";
import { newRegistry } from "@statewalker/utils";

describe("Abc", () => {
  it(`should ...`, async () => {
    const [register, cleanup] = newRegistry();
    try {
      const messageChannel = new MessageChannel();
      register(() => {
        messageChannel.port1.close();
        messageChannel.port2.close();
      });
      register(handleHttpRequests(messageChannel.port1, handleHttpRequest));
      const request = newHttpRequest();
      const result = await sendHttpRequest(
        messageChannel.port2,
        request,
      );
      messageChannel.port1.addEventListener("message", console.error);
      const json = await result.json();
      try {
        expect(json).to.eql({
          "key": "abc",
          "path": "new/resource",
          "baseUrl": "https://foo.bar.baz/~abc/",
          "url": "https://foo.bar.baz/~abc/new/resource",
          "message": "Hello!",
          "content": [
            "Hello-0\n",
            "Hello-1\n",
            "Hello-2\n",
            "Hello-3\n",
            "Hello-4\n",
            "Hello-5\n",
            "Hello-6\n",
            "Hello-7\n",
            "Hello-8\n",
            "Hello-9\n",
          ],
        });
      } catch (error) {
        console.log(JSON.stringify(json, null, 2));
        throw error;
      }
    } finally {
      cleanup();
    }
  });
});

function newHttpRequest() {
  async function* generateText() {
    const encoder = new TextEncoder();
    for (let i = 0; i < 10; i++) {
      const str = `Hello-${i}\n`;
      yield encoder.encode(str);
      await new Promise((r) => setTimeout(r), Math.random() * 30);
    }
  }
  const requestBody = toReadableStream(generateText());
  return new Request("https://foo.bar.baz/~abc/new/resource", {
    method: "POST",
    duplex: "half",
    body: requestBody,
  });
}

async function handleHttpRequest(request) {
  const url = request.url;
  let key = "";
  let path = "";
  let baseUrl = "";
  url.replace(/^(.*~([^\/]*)\/)(.*)*/, (_, b, k, p) => {
    baseUrl = b;
    key = k;
    path = p;
    return "";
  });
  // console.log(request.url);
  const content = [];
  if (request.method === "POST") {
    const decoder = new TextDecoder();
    for await (
      let item of fromReadableStream(
        await request.body,
      )
    ) {
      const str = decoder.decode(item);
      content.push(str);
    }
  }

  const code = {
    key,
    path,
    baseUrl,
    url,
    message: "Hello!",
    content,
  };
  return new Response(JSON.stringify(code, null, 2), {
    headers: {
      "Content-Type": "text/plain",
      "X-Foo-Bar": "baz",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  });
}
