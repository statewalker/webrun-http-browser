import { newRegistry } from "@statewalker/utils";
import { callChannel, handleChannelCalls } from "./data-calls.js";
import { get, set } from "idb-keyval";

export class SwPortHandler {
  constructor(options) {
    this.options = options;
    if (!this.key) throw new Error("Key is not defined.");
    if (!this.scope) throw new Error("Scope is not defined");
  }

  get key() {
    return this.options.key;
  }

  get scope() {
    return this.options.scope || new URL("./", this.serviceWorkerUrl).pathname;
  }

  get rootUrl() {
    return new URL(this.scope, import.meta.url)
  }

  get serviceWorkerUrl() {
    if (!this._serviceWorkerUrl) {
      let url = this.options.serviceWorkerUrl
        ? new URL(this.options.serviceWorkerUrl)
        : new URL("./index-sw.js", this.rootUrl);
      this._serviceWorkerUrl = url + "";
    }
    return this._serviceWorkerUrl;
  }

  async _newCommunicationChannel() {
    const messageChannel = new MessageChannel();
    return [messageChannel.port1, messageChannel.port2];
  }

  async _setCommunicationPort(port) {
    await this.options.bindPort(port);
  }

  async _updateCommunicationChannel() {
    // console.log("[_updateCommunicationChannel]", this._serviceWorker);
    if (!this._serviceWorker) return;
    const [port1, port2] = await this._newCommunicationChannel();
    await this._setCommunicationPort(port1);
    await callChannel(
      this._serviceWorker,
      "UPDATE_COMMUNICATION_PORT",
      this._getRegistrationInfo(),
      port2,
    );
  }

  _getRegistrationInfo() {
    return { key: this.key };
  }

  /**
   * Starts the server.
   */
  async start() {
    return this._registrationPromise = this._registrationPromise ||
      (async () => {
        const [register, cleanup] = newRegistry();
        this._cleanupRegistrations = cleanup;
        register(() => this._cleanupRegistrations = null);
        const registration = await navigator.serviceWorker.register(
          this.serviceWorkerUrl,
          {
            // type: "module",
            scope: this.scope,
          },
        );
        register(() => registration.unregister());

        // (example: when the service worker is the same but it is waked up/activated after an idle period)
        register(
          handleChannelCalls(
            navigator.serviceWorker,
            "UPDATE_COMMUNICATION_PORT",
            async (event, params, port) => {
              console.log("[UPDATE_COMMUNICATION_PORT]", port);
              this._setCommunicationPort(port);
              return this._getRegistrationInfo();
            },
          ),
        );

        this._serviceWorker = await getServiceWorkerController();
        await awaitServiceWorkerActivation(this._serviceWorker);
        await this._updateCommunicationChannel();

        async function getServiceWorkerController() {
          return await new Promise((resolve) => {
            // Resolve right away if this page is already controlled.
            const serviceWorker = navigator.serviceWorker;
            if (serviceWorker.controller) {
              resolve(serviceWorker.controller);
            } else {
              const onChange = () => {
                resolve(serviceWorker.controller);
                serviceWorker.removeEventListener("controllerchange", onChange);
                serviceWorker.oncontrollerchange = null;
              };
              serviceWorker.addEventListener("controllerchange", onChange);
              serviceWorker.oncontrollerchange = onChange;
            }
          });
        }

        // ------------------------------
        // Await until the service is ready
        async function awaitServiceWorkerActivation(worker) {
          const isActivated = () => worker.state === "activated";
          await new Promise(async (resolve) => {
            if (isActivated()) resolve();
            else {
              worker.onstatechange = () => {
                if (!isActivated()) return;
                worker.onstatechange = null;
                resolve();
              };
            }
          });
        }
      })();
  }

  /**
   * Stops the server and removes associated handlers.
   */
  async stop() {
    if (this._cleanupRegistrations) this._cleanupRegistrations();
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      try {
        await registration.unregister();
      } catch (error) {
        console.log("Service Worker registration failed: ", error);
      }
    }
  }
}

export class SwPortDispatcher {
  constructor({ self, log }) {
    this.self = self;
    this.log = log;
    // Contains mapping between path prefixes and clientIds
    this.handlersIndex = new Map();
  }

  get scope() {
    return new URL("./", import.meta.url) + '';
  }

  async loadChannelInfo(key) {
    await this._checkActivation();
    let result;
    for (let channelInfo of this.handlersIndex.values()) {
      if (channelInfo.key !== key) continue;
      const clientId = channelInfo.clientId;
      const client = await self.clients.get(clientId);
      if (!client) {
        // Client gone. Remove the corresponding handlers from the index.
        this.handlersIndex.delete(clientId);
        throw Object.assign(new Error("Error 410: Resource Gone"), {
          status: 410,
        });
      }
      result = channelInfo;
      break;
    }
    return result;
  }

  start() {
    this._cleanup = handleChannelCalls(
      this.self,
      "UPDATE_COMMUNICATION_PORT",
      async (event, channelInfo, port) => {
        const clientId = event.source.id;
        this.log("[UPDATE_COMMUNICATION_PORT]", clientId, channelInfo);
        await this._updateChannelInfo({ ...channelInfo, port, clientId });
        return { ...channelInfo };
      },
    );
    this.self.onmessage = () => {};

    this.self.addEventListener("install", (event) => {
      this.log("Skip waiting on install.", event);
      this.self.skipWaiting();
    });

    this.self.addEventListener("activate", async (event) => {
      this.log(
        "Claim control over all clients.",
        event,
        clients,
        this.self.clients,
      );
      event.waitUntil((async () => {
        await this.self.clients.claim();
        await this._checkActivation();
      })());
    });
  }

  async stop() {
    if (this._cleanup) {
      await this._cleanup();
      this._cleanup = undefined;
    }
  }

  async _checkActivation() {
    return this._activationPromise = this._activationPromise ||
      this._activate();
  }

  async _activate() {
    this.log("[checkActivation]");
    let clientsIndex = await this._loadClientIds();
    for (let [clientId, client] of clientsIndex.entries()) {
      const messageChannel = new MessageChannel();
      const port = messageChannel.port1;
      const channelInfo = await callChannel(
        client,
        "UPDATE_COMMUNICATION_PORT",
        {},
        messageChannel.port2,
      );
      await this._updateChannelInfo({ ...channelInfo, port, clientId });
    }
  }

  async _updateChannelInfo(channelInfo) {
    this.log("[updateClientInfo]", channelInfo);
    this.handlersIndex.set(channelInfo.clientId, channelInfo);
    await this._updateClientIds([]);
  }

  async _loadClientIds() {
    const clientIds = new Set((await get("clientIds")) || []);
    return await this._updateClientIds(clientIds);
  }

  async _updateClientIds(clientIds) {
    clientIds = new Set(clientIds);
    for (let clientId of this.handlersIndex.keys()) {
      clientIds.add(clientId);
    }
    const index = new Map();
    for (let clientId of clientIds) {
      const client = await this.self.clients.get(clientId);
      if (client) index.set(clientId, client);
      else this.handlersIndex.delete(clientId);
    }
    await set("clientIds", [...index.keys()].sort());
    return index;
  }
}
