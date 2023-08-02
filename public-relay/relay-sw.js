import {
  // serializeError, deserializeError,
  callChannel,
  handleChannelCalls,
  newRegistry,
  sendHttpRequest,
} from "../dist/index.js";
import { registerConnectionsHandler } from "./relay-lib.js";

if (typeof self.skipWaiting === "function") {
  console.log("self.skipWaiting() is supported.");
  self.addEventListener("install", (e) => {
    // See https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#service-worker-global-scope-skipwaiting
    e.waitUntil(self.skipWaiting());
  });
} else {
  console.log("self.skipWaiting() is not supported.");
}

if (self.clients && (typeof self.clients.claim === "function")) {
  console.log("self.clients.claim() is supported.");
  self.addEventListener("activate", (e) => {
    // See https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#clients-claim-method
    e.waitUntil(self.clients.claim());
  });
} else {
  console.log("self.clients.claim() is not supported.");
}

const baseUrl = new URL("./", import.meta.url) + "";
const clientsRegistry = newClientsRegistry(self);

// This listener handles the following message types:
// * registration: registers new clients as service providers
// * handles service calls rounting:
//   - it gets the clientKey defined in the call
//   - it uses the serviceKey to get the service-specifc channel
//   - it creates a new message channel and sent its ports to peers

const [register, clear] = newRegistry();

register(handleChannelCalls(self, "REGISTER", async (event, data) => {
  return await clientsRegistry.addClient(data.key, event.source);
}));
register(handleChannelCalls(self, "UNREGISTER", async (event, data) => {
  return await clientsRegistry.removeClient(data.key);
}));

// Transfers all parameters (and ports) to the target client.
register(handleChannelCalls(self, "CONNECT", async (event, data, port) => {
  const { key } = data;
  const client = await clientsRegistry.getClient(key);
  if (!client) {
    throw new Error(`Target client was not found. Target key: "${key}".`);
  }
  return await callChannel(client, "CONNECT", data, port);
}));

function splitServiceUrl(url, separator = "~") {
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
        if (baseUrl.length < str.length) { baseUrl += "/"; }
        key = $1;
        path = str.substring(baseUrl.length);
        return "";
      });
  }
  return {
    url,
    key,
    baseUrl,
    path
  };
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const params = splitServiceUrl(request.url);
  const { key } = params;
  if (key) {
    event.respondWith((async () => {
      try {
        const channel = new MessageChannel();
        const client = await clientsRegistry.getClient(key);
        if (!client) {
          throw HttpError.errorResourceGone(params);
        }
        const data = {
          type: "http",
          key,
        };
        if (!await callChannel(client, "CONNECT", data, channel.port2)) {
          throw HttpError.errorForbidden(params);
        }
        return await sendHttpRequest(channel.port1, request);
      } catch (error) {
        error = HttpError.fromError(error);
        const options = error.getResponseOptions(params);
        return new Response(JSON.stringify(options), {
          ...options,
          headers: {
            "Content-Type": "text/javascript",
          },
        });
      }
    })());
  }
});
// self.onmessage = (event) => {
//   console.log("SW MESSAGE:", event, event.ports);
//   const [port] = event.ports || [];
//   if (port) {
//     port.onmessage = (ev) => {
//       // const data = ev.data || {};
//       console.log("Reply from the other side of the moon", ev);
//       // port.postMessage({
//       //   message: "Reply from the other side",
//       //   ...data
//       // })
//     };
//     port.postMessage({ message: "Message from the Service Worker HELL!" });
//   }
// };

class HttpError extends Error {
  constructor(options) {
    super(options.message);
    this.status = options.status;
    this.statusText = options.statusText;
  }
  getResponseOptions(options = {}) {
    return Object.assign(this.toJson(), options);
  }
  toJson() {
    return {
      status: this.status,
      statusText: this.statusText,
      message: this.message,
    };
  }

  static fromError(error) {
    if (!(error instanceof HttpError)) {
      error = new HttpError(Object.assign({
        status: 500,
        statusText: "Bad Request",
        reason: error.message,
      }));
    }
    return error;
  }

  static errorResourceNotFound(options = {}) {
    return new HttpError({
      status: 404,
      statusText: "Error 404: Resource not found",
      ...options,
    });
  }
  static errorForbidden(options = {}) {
    return new HttpError({
      status: 403,
      statusText: "Error 403: Forbidden",
      ...options,
    });
  }

  static errorResourceGone(options = {}) {
    return new HttpError({
      status: 410,
      statusText: "Error 410: Resource Gone",
      ...options,
    });
  }

  static errorInternalError(options) {
    return new HttpError({
      ...options,
      status: 500,
      statusText: "Error 500: Internal error",
    });
  }
}

// self.addEventListener("fetch", (event) => {
//   console.log("fetching resource", event);
//   const request = event.request;
//   const requestUrl = request.url;
//   if (requestUrl.match(/\/ping$/)) {
//     event.respondWith((async () => {
//       return new Response("pong", { status: 200 });
//     })());
//   } else if (requestUrl.indexOf(baseUrl) === 0) {
//     const clientKey = requestUrl
//       .substring(baseUrl.length)
//       .replace(/^\/?([^\/]+).*$/, "$1");
//     if (clientKey) {
//       event.respondWith((async () => {
//         try {
//           const client = await clientsRegistry.getClient(clientKey);
//           if (!client) { throw HttpError.errorResourceGone(); }
//           const port = portsRegistry.getClientPort(client, "http");

//           return new Response("pong", { status: 200 });
//         } catch (error) {
//           if (!(error instanceof HttpError)) {
//             error = HttpError.errorInternalError(error);
//           }
//           console.error(error);
//           return new Response(null, error.getResponseOptions());
//         }
//       })());
//     }
//   }
//   // const response = new Response(
//   //   `<p>This is a response that comes from your service worker! ${Date.now()}</p>`,
//   //   {
//   //     headers: { "Content-Type": "text/html" },
//   //   },
//   // );
//   // event.respondWith(response);
// });

// --------------------------------------------
// errors.js

// --------------------------------------------

function newClientsRegistry(self) {
  const KEY = "clientsIds";

  let _index;
  async function loadClientsIndex() {
    if (!_index) {
      const entries = (await get(KEY)) || [];
      _index = Object.fromEntries(entries);
    }
    return _index;
  }
  async function storeClientsIndex() {
    const index = await loadClientsIndex();
    const entries = Object.entries(index);
    await set(KEY, entries);
    return index;
  }

  async function addClient(clientKey, client) {
    const index = await loadClientsIndex();
    const clientId = client.id;
    let result = false;
    if (!(clientId in index)) {
      index[clientKey] = clientId;
      await storeClientsIndex();
      result = true;
    }
    return result;
  }

  async function removeClient(clientKey) {
    const index = await loadClientsIndex();
    let result = false;
    if (clientKey in index) {
      delete index[clientKey];
      await storeClientsIndex();
      result = true;
    }
    return result;
  }

  async function getClient(clientKey) {
    const index = await loadClientsIndex();
    const clientId = index[clientKey];
    const client = await self.clients.get(clientId);
    if (!client) {
      delete index[clientKey];
      await storeClientsIndex();
    }
    return client;
  }

  return {
    getClient,
    addClient,
    removeClient,
  };
}
// ----------------------------------------------------
// Content of the "idb-keyval" package
// import { get, set } from "idb-keyval";

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    // @ts-ignore - file size hacks
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    // @ts-ignore - file size hacks
    request.onabort = request.onerror = () => reject(request.error);
  });
}
function createStore(dbName, storeName) {
  const request = indexedDB.open(dbName);
  request.onupgradeneeded = () => request.result.createObjectStore(storeName);
  const dbp = promisifyRequest(request);
  return (txMode, callback) =>
    dbp.then((db) =>
      callback(db.transaction(storeName, txMode).objectStore(storeName))
    );
}
let defaultGetStoreFunc;
function defaultGetStore() {
  if (!defaultGetStoreFunc) {
    defaultGetStoreFunc = createStore("keyval-store", "keyval");
  }
  return defaultGetStoreFunc;
}
/**
 * Get a value by its key.
 *
 * @param key
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */
function get(key, customStore = defaultGetStore()) {
  return customStore("readonly", (store) => promisifyRequest(store.get(key)));
}
/**
 * Set a value with a key.
 *
 * @param key
 * @param value
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */
function set(key, value, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.put(value, key);
    return promisifyRequest(store.transaction);
  });
}
