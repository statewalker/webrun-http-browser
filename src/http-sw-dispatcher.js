import { sendHttpRequest } from "./http-send-recieve.js";
import { callChannel, handleChannelCalls } from "./data-calls.js";
import { get, set } from "idb-keyval";

export function startHttpDispatcher({ self, log }) {
  // Contains mapping between path prefixes and clientIds
  const handlersIndex = new Map();

  async function updateClientIds(clientIds) {
    clientIds = new Set(clientIds);
    for (let clientId of handlersIndex.keys()) {
      clientIds.add(clientId);
    }
    const index = new Map();
    for (let clientId of clientIds) {
      const client = await self.clients.get(clientId);
      if (client) index.set(clientId, client);
      else handlersIndex.delete(clientId);
    }
    await set("clientIds", [...index.keys()].sort());
    return index;
  }

  async function loadClientIds() {
    const clientIds = new Set((await get("clientIds")) || []);
    return await updateClientIds(clientIds);
  }

  let activationPromise;
  async function checkActivation() {
    return activationPromise = activationPromise || (async () => {
      log("[checkActivation]");
      let clientsIndex = await loadClientIds();
      for (let [clientId, client] of clientsIndex.entries()) {
        const messageChannel = new MessageChannel();
        const port = messageChannel.port1;
        const { urls = [] } = await callChannel(
          client,
          "UPDATE_COMMUNICATION_PORT",
          {},
          messageChannel.port2,
        );
        await updateClientRefs({ urls, port, clientId });
      }
    })();
  }

  async function updateClientRefs({ clientId, port, urls = [] }) {
    log("[updateClientRefs]", { clientId, urls });
    handlersIndex.set(clientId, { clientId, port, urls });
    await updateClientIds([]);
  }

  async function loadClientPort(accept) {
    await checkActivation();
    let clientPort;
    for (let entry of handlersIndex.values()) {
      if (!accept(entry)) continue;
      const clientId = entry.clientId;
      const client = await self.clients.get(clientId);
      if (!client) {
        // Client gone. Remove the corresponding handlers from the index.
        handlersIndex.delete(clientId);
        throw Object.assign(new Error("Error 410: Resource Gone"), {
          status: 410,
        });
      }
      clientPort = entry.port;
      break;
    }
    return clientPort;
  }

  self.addEventListener(
    "fetch",
    async (event) =>
      event.respondWith((async () => {
        const request = event.request;
        try {
          const requestUrl = request.url;
          const clientPort = await loadClientPort(({ urls }) => {
            for (let baseUrl of urls) {
              if (requestUrl.indexOf(baseUrl) === 0) return true;
            }
            return false;
          });
          if (clientPort) {
            return await sendHttpRequest(clientPort, request);
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
      })()),
  );

  const cleanup = handleChannelCalls(
    self,
    "UPDATE_COMMUNICATION_PORT",
    async (event, params, port) => {
      const { urls = [] } = params;
      const clientId = event.source.id;
      log("[UPDATE_COMMUNICATION_PORT]", clientId, params);
      await updateClientRefs({ urls, port, clientId });
      return { ...params };
    },
  );
  self.onmessage = () => {};

  self.addEventListener("install", (event) => {
    log("Skip waiting on install.", event);
    self.skipWaiting();
  });

  self.addEventListener("activate", async (event) => {
    log("Claim control over all clients.", event, clients, self.clients);
    event.waitUntil((async () => {
      await self.clients.claim();
      await checkActivation();
    })());
  });

  return cleanup;
}
