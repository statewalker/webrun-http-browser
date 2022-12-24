import { sendHttpRequest } from "./http-send-recieve.js";
import { handleChannelCalls } from "./data-calls.js";

function start({ self, log }) {
  // Contains mapping between path prefixes and clientIds
  const  handlersIndex = new Map();

  self.addEventListener("fetch", async (event) => {
    let handled = false;
    for (const [baseUrl, info] of  handlersIndex.entries()) {
      if (event.request.url.indexOf(baseUrl) !== 0) continue;
      event.respondWith((async () => {
        const client = await self.clients.get(info.clientId);
        if (!client) {
          // Client gone. Remove the corresponding handlers from the index.
          handlersIndex.delete(baseUrl);
          return new Response(null, {
            status : 410,
            statusText : "Error 410: Resource Gone",
          })
        }  
        return sendHttpRequest(info.port, event.request)
      })());
      handled = true;
      break;
    }
    log(`Fetch request ${handled ? 'was handled' : 'was NOT handled'}. URL: "${event.request.url}"`);
  });

  const cleanup = handleChannelCalls(
    self,
    "CHANNEL_OPEN",
    async (event, params, port) => {
      const { baseUrl } = params;
      log("Open new channel", event.source.id, params);
      const clientId = event.source.id;
       handlersIndex.set(baseUrl, { baseUrl, port, clientId });
      return { ...params };
    },
  );
  self.onmessage = () => {}

  self.addEventListener("install", (event) => {
    log("Skip waiting on install.", event);
    self.skipWaiting();
  });

  self.addEventListener("activate", async (event) => {
    /* */
    const clients = await self.clients.matchAll();
    log("Claim control over all clients.", event, clients, self.clients);
    return await self.clients.claim();
    // */

    /* * /
    log("Reload all clients.");
    await self.registration.unregister()
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.navigate(client.url))
    return await self.clients.claim();
    // */

  });
  return cleanup;
}

export const result = start({
  self,
  log : console.log.bind(console, "[sw]")
});
