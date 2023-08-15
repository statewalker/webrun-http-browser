import { startRelayServiceWorker } from "./src/relay/index-sw.js";

const cleanup = startRelayServiceWorker(self);
// 