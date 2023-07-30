import { SwHttpAdapter } from "../dist/index.js";

export default function (options) {
  return new SwHttpAdapter({
    serviceWorkerUrl: new URL("./index-service-worker.js", import.meta.url) +
      "",
    ...options,
  });
}
