import { startHttpDispatcher } from "./http-sw-dispatcher.js";

export const result = startHttpDispatcher({
  self,
  log: console.log.bind(console, "[sw]"),
});
