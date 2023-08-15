// It is important to include the Service Worker in this file:
// the service worker controls all resources starting from the 
// base URL of the running script.
// By including the script directly (without this file) you change 
// the base URL of the controlled resources, and it is not what you want!
importScripts("../dist/index-sw.js");
