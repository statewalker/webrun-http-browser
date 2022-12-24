import { callChannel } from "./data-calls.js";
import { handleHttpRequests } from "./http-send-recieve.js";

// import { register } from 'register-service-worker'

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
  get scope() {
    return this.options.scope || new URL("./", this.serviceWorkerUrl).pathname;
  }

  get rootUrl() {
    if (!this._rootUrl) {
      this._rootUrl = this.options.rootUrl || new URL("./", this.serviceWorkerUrl) + ''
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

  async _checkStarted() {
    return this._registrationPromise = this._registrationPromise ||
      new Promise(async (resolve, reject) => {
        try {
          if (!navigator.serviceWorker) {
            throw new Error("navigator.serviceWorker is not available");
          }
          const registration = await navigator.serviceWorker.register(
            this.serviceWorkerUrl,
            {
              // type: "module",  
              scope: this.scope,
            },
          );
          let serviceWorker;
          for (const state of ["installing", "waiting", "active"]) {
            if (registration[state]) {
              serviceWorker = registration[state];
              break;
            }
          }
          this._serviceWorker = serviceWorker;
          const isActivated = () => serviceWorker.state === "activated";
          if (!isActivated()) {
            serviceWorker.addEventListener("statechange", function handler(e) {
              if (!isActivated()) return;
              serviceWorker.removeEventListener("statechange", handler);
              resolve({
                registration,
                serviceWorker,
              });
            });
          } else {
            resolve({
              registration,
              serviceWorker,
            });
          }
        } catch (error) {
          reject(error);
        }
      });
  }

  /**
   * Registers the given request handler.
   * @param {string} prefix unique base URL prefix used to register the specified handler
   * @param {*} handler the request handler
   * @return {string} full URL of the resulting endpoint
   */
  async register(prefix, handler) {
    const { serviceWorker } = await this._checkStarted();


    const messageChannel = new MessageChannel();
    prefix = "./" + (prefix || "").replace(/^[\.\/]+/, "");
    const baseUrl = new URL(prefix, this.rootUrl) + "";
    const result = await callChannel(serviceWorker, "CHANNEL_OPEN", {
      baseUrl,
      prefix,
    }, messageChannel.port2);
    await handleHttpRequests(messageChannel.port1, handler);
    return {
      ...result,
      async remove() {
      },
    };
  }

  /**
   * Starts the server.
   */
  async start() {
    /* 
    register(this.serviceWorkerUrl, {
      registrationOptions: {
        type: "module",
        scope: this.scope,
      },
      ready (registration) {
        console.log('Service worker is active.')
      },
      registered (registration) {
        console.log('Service worker has been registered.')
      },
      cached (registration) {
        console.log('Content has been cached for offline use.')
      },
      updatefound (registration) {
        console.log('New content is downloading.')
      },
      updated (registration) {
        console.log('New content is available; please refresh.')
      },
      offline () {
        console.log('No internet connection found. App is running in offline mode.')
      },
      error (error) {
        console.error('Error during service worker registration:', error)
      }
    })
    */
  }

  /**
   * Stops the server and removes associated handlers.
   */
  async stop() {
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
