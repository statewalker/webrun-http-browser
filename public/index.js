import { BrowserHttpAdapter } from "../dist/index.js";

export const httpAdapter = new BrowserHttpAdapter({
  serviceWorkerUrl : new URL("./index-service-worker.js", import.meta.url) + ''
})