import { newRegistry } from "@statewalker/utils";
import { callChannel, handleChannelCalls } from "../core/data-calls.js";
import {
  handleHttpRequests,
  sendHttpRequest,
} from "../http/http-send-recieve.js";
export * from "./splitServiceUrl.js";

export function newServiceWorkerPort() {
  // Bind the service worker to
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    navigator.serviceWorker.controller.postMessage(event.data, event.ports);
  };
  navigator.serviceWorker.addEventListener("message", (event) => {
    channel.port1.postMessage(event.data, event.ports);
  });
  return channel.port2;
}

export async function initServiceWorker1({ swUrl, scopeUrl, type }) {
  const {
    installing,
    waiting,
    active,
  } = await navigator.serviceWorker.register(swUrl, {
    // type: "module",
    scope: scopeUrl,
  });
  (installing || waiting || active).addEventListener("statechange", (e) => {
    console.log("state", e.target.state);
  });

  const serviceWorker = navigator.serviceWorker;
  await new Promise((resolve) => {
    // Resolve right away if this page is already controlled.
    if (serviceWorker.controller) {
      resolve();
    } else {
      const onChange = () => {
        resolve();
        serviceWorker.removeEventListener("controllerchange", onChange);
        serviceWorker.oncontrollerchange = null;
      };
      serviceWorker.addEventListener("controllerchange", onChange);
      serviceWorker.oncontrollerchange = onChange;
    }
  });
  const worker = serviceWorker.controller;
  const isActivated = () => worker.state === "activated";
  return await new Promise(async (resolve) => {
    if (isActivated()) resolve(worker);
    else {
      worker.onstatechange = () => {
        if (!isActivated()) return;
        worker.onstatechange = null;
        resolve(worker);
      };
    }
  });
}

export async function initServiceWorker({ swUrl, scopeUrl, type }) {
  await navigator.serviceWorker.register(swUrl, {
    type,
    scope: scopeUrl,
  });
  const worker = await getServiceWorkerController();
  await awaitServiceWorkerActivation(worker);
  return worker;

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
}

export async function initHttpService(handler, {
  key,
  port,
}) {
  return await registerConnectionsHandler({
    key,
    communicationPort: port,
    handler: async (event, data, callPort) => {
      handleHttpRequests(callPort, handler);
      return true;
    },
  });
}

export async function callHttpService(request, {
  key,
  port,
}) {
  const callPort = await initializeConnection({
    key,
    communicationPort: port,
  });
  const result = await sendHttpRequest(callPort, request);
  return result;
}

export function getRelayWindowMessageHandler({
  swUrl = new URL("./index-sw.js", import.meta.url) + "",
  scopeUrl = new URL("../", import.meta.url) + "",
} = {}) {
  let externalPort;
  return async (ev) => {
    if (ev.data.type === "CONNECT") {
      const newExternalPort = (ev.ports || [])[0];
      if (externalPort) {
        newExternalPort.close();
        return;
      }
      externalPort = newExternalPort;
      await initServiceWorker({
        swUrl,
        scopeUrl,
      });
      const serviceWorkerPort = newServiceWorkerPort();
      serviceWorkerPort.onmessage = (event) => {
        externalPort.postMessage(event.data, event.ports);
      };

      externalPort.onmessage = (event) => {
        serviceWorkerPort.postMessage(event.data, event.ports);
      };
    }
  };
}

export async function newRemoteRelayChannel({
  baseUrl = new URL("../public-relay/", import.meta.url),
  url = new URL("relay.html", baseUrl),
  container = document.body,
} = {}) {
  const messageChannel = new MessageChannel();
  const { iframe, promise } = await newIFrame(url);
  Object.assign(iframe.style, {
    // height: "100px"
    position: "fixed",
    width: "1px",
    height: "1px",
    top: "-1000",
    left: "-1000",
    display: "block",
    opacity: "0",
    border: "none",
    outline: "none",
  });
  container.appendChild(iframe);
  promise.then(() => {
    iframe.contentWindow.postMessage(
      {
        type: "CONNECT",
      },
      "*",
      [messageChannel.port1],
    );
  });
  return {
    baseUrl,
    port: messageChannel.port2,
    close: () => {
      iframe.parentElement && iframe.parentElement.removeChild(iframe);
      messageChannel.port1.close();
      messageChannel.port2.close();
    },
  };

  async function newIFrame(url) {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    Object.assign(iframe.style, {
      padding: 0,
      margin: 0,
      border: "none",
      outline: "none",
      width: "100%",
      height: "100%",
    });
    return {
      iframe,
      promise: new Promise((resolve, reject) => {
        try {
          iframe.onerror = reject;
          iframe.onload = () => resolve(iframe);
        } catch (error) {
          reject(error);
        }
      }),
    };
  }
}
// -------------------------------------------------------

export async function initializeConnection({
  key,
  communicationPort,
  ...options
}) {
  const channel = new MessageChannel();
  const accepted = await callChannel(
    communicationPort,
    "CONNECT",
    { key, ...options },
    channel.port2,
  );
  if (!accepted) {
    channel.port1.close();
    channel.port2.close();
    return null;
  }
  return channel.port1;
}

export async function registerConnectionsHandler({
  key,
  handler,
  communicationPort,
}) {
  const [register, cleanup] = newRegistry();
  await callChannel(communicationPort, "REGISTER", { key });
  register(() => callChannel(communicationPort, "UNREGISTER", { key }));
  register(
    handleChannelCalls(
      communicationPort,
      "CONNECT",
      handler,
    ),
  );
  return cleanup;
}
