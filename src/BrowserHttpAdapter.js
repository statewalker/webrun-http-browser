import { callChannel, handleChannelCalls } from "./data-calls.js";
import { handleHttpRequests } from "./http-send-recieve.js";
import { newRegistry } from "@statewalker/utils";

class HttpAdapter {
  constructor(options) {
    this.options = options || {};
  }

  /**
   * Registers the given request handler.
   * @param {string} prefix unique path prefix used to register the specified handler
   * @param {*} handler the request handler
   * @return {string} full URL of the resulting endpoint
   */
  async register(prefix, handler) {
  }

  /**
   * Starts the server.
   */
  async start() {
  }

  /**
   * Stops the server and removes associated handlers.
   */
  async stop() {
  }
}

export class BrowserHttpAdapter extends HttpAdapter {
  constructor(options) {
    super(options);
    this._handlers = new Map();
  }

  get scope() {
    return this.options.scope || new URL("./", this.serviceWorkerUrl).pathname;
  }

  get rootUrl() {
    if (!this._rootUrl) {
      this._rootUrl = this.options.rootUrl ||
        new URL("./", this.serviceWorkerUrl) + "";
    }
    return this._rootUrl;
  }

  get serviceWorkerUrl() {
    if (!this._serviceWorkerUrl) {
      let url = this.options.serviceWorkerUrl
        ? new URL(this.options.serviceWorkerUrl)
        : new URL("./index-sw.js", import.meta.url);
      this._serviceWorkerUrl = url + "";
    }
    return this._serviceWorkerUrl;
  }

  async _handleHttpRequests(request) {
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
    const baseUrl = new URL(prefix, this.rootUrl) + "";
    this._handlers.set(baseUrl, handler);
    await this._notifyChanges();
    return {
      baseUrl,
      prefix,
      async remove() {
        this._handlers.delete(baseUrl);
        await this._notifyChanges();
      },
    };
  }

  async _notifyChanges() {
    await this.start();
    await this._updateCommunicationChannel();
  }

  async _updateCommunicationChannel() {
    console.log('[_updateCommunicationChannel]', this._serviceWorker)
    if (!this._serviceWorker) return ;
    const messageChannel = new MessageChannel();
    this._setCommunicationPort(messageChannel.port1);
    const params = this._getRegistrationInfo();
    await callChannel(
      this._serviceWorker,
      "UPDATE_COMMUNICATION_PORT",
      params,
      messageChannel.port2,
    );
  }

  _setCommunicationPort(port) {
    if (this._cleanupRequestChannel) {
      this._cleanupRequestChannel();
    }
    this._cleanupRequestChannel = handleHttpRequests(
      port,
      this._handleHttpRequests.bind(this),
    );
  }

  _getRegistrationInfo() {
    const urls = [...this._handlers.keys()];
    return { urls };
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
              console.log('[UPDATE_COMMUNICATION_PORT]', port)
              this._setCommunicationPort(port);
              return this._getRegistrationInfo();
            },
          ),
        );

        // Track when the controller changes
        const onChangeControler = async () => {
          this._serviceWorker = navigator.serviceWorker.controller;
          if (this._serviceWorker) {
            await awaitServiceWorkerActivation(this._serviceWorker);
            await this._updateCommunicationChannel();
          }
        };
        await onChangeControler();
        navigator.serviceWorker.oncontrollerchange = onChangeControler;
        register(() => navigator.serviceWorker.oncontrollerchange = null);

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
