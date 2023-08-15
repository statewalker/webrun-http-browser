import { newRegistry } from "@statewalker/utils";
import { get, set } from "idb-keyval";
import { callChannel, handleChannelCalls } from "../core/data-calls.js";
import { sendHttpRequest } from "../http/http-send-recieve.js";
import { splitServiceUrl } from "./splitServiceUrl.js";
import { HttpError } from "../http/HttpError.js";

export function startRelayServiceWorker(self) {
  const [register, clear] = newRegistry();

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

  const clientsRegistry = newClientsRegistry({
    self,
    get,
    set,
  });

  // This listener handles the following message types:
  // * registration: registers new clients as service providers
  // * handles service calls rounting:
  //   - it gets the clientKey defined in the call
  //   - it uses the serviceKey to get the service-specifc channel
  //   - it creates a new message channel and sent its ports to peers

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

  const fetchListener = (event) => {
    const request = event.request;
    const params = splitServiceUrl(request.url);
    const { key } = params;
    if (key) {
      const handler = async () => {
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
      };
      event.respondWith(handler());
    }
  };
  self.addEventListener("fetch", fetchListener);
  register(() => self.removeEventListener("fetch", fetchListener));

  return clear;
}

// --------------------------------------------
// errors.js

// --------------------------------------------

function newClientsRegistry({
  self,
  key = "clientsIds",
  get,
  set,
}) {
  let _index;
  async function loadClientsIndex() {
    if (!_index) {
      const entries = (await get(key)) || [];
      _index = Object.fromEntries(entries);
    }
    return _index;
  }
  async function storeClientsIndex() {
    const index = await loadClientsIndex();
    const entries = Object.entries(index);
    await set(key, entries);
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

// function promisifyRequest(request) {
//   return new Promise((resolve, reject) => {
//     // @ts-ignore - file size hacks
//     request.oncomplete = request.onsuccess = () => resolve(request.result);
//     // @ts-ignore - file size hacks
//     request.onabort = request.onerror = () => reject(request.error);
//   });
// }
// function createStore(dbName, storeName) {
//   const request = indexedDB.open(dbName);
//   request.onupgradeneeded = () => request.result.createObjectStore(storeName);
//   const dbp = promisifyRequest(request);
//   return (txMode, callback) =>
//     dbp.then((db) =>
//       callback(db.transaction(storeName, txMode).objectStore(storeName))
//     );
// }
// let defaultGetStoreFunc;
// function defaultGetStore() {
//   if (!defaultGetStoreFunc) {
//     defaultGetStoreFunc = createStore("keyval-store", "keyval");
//   }
//   return defaultGetStoreFunc;
// }
// /**
//  * Get a value by its key.
//  *
//  * @param key
//  * @param customStore Method to get a custom store. Use with caution (see the docs).
//  */
// function get(key, customStore = defaultGetStore()) {
//   return customStore("readonly", (store) => promisifyRequest(store.get(key)));
// }
// /**
//  * Set a value with a key.
//  *
//  * @param key
//  * @param value
//  * @param customStore Method to get a custom store. Use with caution (see the docs).
//  */
// function set(key, value, customStore = defaultGetStore()) {
//   return customStore("readwrite", (store) => {
//     store.put(value, key);
//     return promisifyRequest(store.transaction);
//   });
// }
