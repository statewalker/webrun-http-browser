import { handleHttpRequests, sendHttpRequest } from "./http-send-recieve.js";
import { SwPortDispatcher, SwPortHandler } from "./sw-dispatcher.js";

export class SwHttpAdapter extends SwPortHandler {
  constructor(options) {
    super(options);
    this._handlers = new Map();
  }

  async _setCommunicationPort(port) {
    if (this._cleanupRequestChannel) {
      this._cleanupRequestChannel();
    }
    this._cleanupRequestChannel = handleHttpRequests(
      port,
      this._handleHttpRequest.bind(this),
    );
  }

  async _handleHttpRequest(request) {
    const requestUrl = request.url;
    let handler;
    for (let entry of this._handlers.entries()) {
      const [urlPrefix] = entry;
      if (requestUrl.indexOf(urlPrefix) === 0) {
        handler = entry[1];
        break;
      }
    }
    return !handler
      ? new Response(null, {
        status: 404,
        statusMessage: "Error 404: Not found",
      })
      : handler(request);
  }

  /**
   * Registers the given request handler.
   * @param {string} prefix unique base URL prefix used to register the specified handler
   * @param {*} handler the request handler
   * @return {string} full URL of the resulting endpoint
   */
  async register(prefix, handler) {
    prefix = "./" + (prefix || "").replace(/^[\.\/]+/, "");
    const rootUrl = this.rootUrl;
    const baseUrl = new URL(prefix, rootUrl) + "";
    this._handlers.set(baseUrl, handler);
    return {
      baseUrl,
      prefix,
      async remove() {
        this._handlers.delete(baseUrl);
      },
    };
  }
}

export class SwHttpDispatcher extends SwPortDispatcher {
  constructor(options) {
    super(options);
  }

  start() {
    super.start();
    this.self.addEventListener("fetch", this._handleFetchEvent.bind(this));
  }

  _handleFetchEvent(event) {
    event.respondWith((async () => {
      const request = event.request;
      try {
        const requestUrl = request.url;
        const rootUrl = this.scope;
        let channelInfo;
        if (requestUrl.indexOf(rootUrl) === 0) {
          const key = requestUrl
            .substring(rootUrl.length)
            .replace(/^\/?([^\/]+).*$/, "$1");
          // console.log(`* rootUrl="${rootUrl}" requestUrl="${requestUrl}" key="${key}"`);
          channelInfo = await this.loadChannelInfo(key);
        }
        if (channelInfo && channelInfo.port) {
          return await sendHttpRequest(channelInfo.port, request);
        } else {
          const newRequest = new Request(requestUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            // mode: request.mode,
            credentials: request.credentials,
            cache: request.cache,
            redirect: request.redirect,
            integrity: request.integrity,
          });
          return await fetch(newRequest);
        }

        // const requestUrl = request.url;
        // let url = requestUrl.replace(
        //   /^.*\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}(.*)$/,
        //   "$1",
        // );
        // if (url !== requestUrl) {
        //   url = new URL(
        //     "/packages/webrun-http-browser/src" + url,
        //     self.location.href,
        //   );
        // }
      } catch (error) {
        console.error(error);
        return new Response(null, {
          status: 500,
          statusText: "Error 500: Internal error",
        });
      }
    })());
  }
}
export function startHttpDispatcher({ self, log }) {
  const dispatcher = new SwHttpDispatcher({ self, log });
  dispatcher.start();
  return () => {
    dispatcher.stop();
  };
}
