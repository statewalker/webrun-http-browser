# @statewalker/webrun-http-browser

This module simulates HTTP server using Service Workers.
It allows to develop, test, run and debug server-side code directly in the browser.
After that the same code can be deployed in Deno / Deno Deploy / Cloudflare / Node JS environments (with adapters).

## Demo

* [Demo 1](./demo/demo-1.html) - a dynamic web site with a server-side API, a HTML page and a CSS file
* [https://observablehq.com/@kotelnikov/webrun-http-service](https://observablehq.com/@kotelnikov/webrun-http-service) - an Observable page demonstrating how it works. You can play with the code here.

## Features 

This module provides a lightweight full-stack development environment in the browser:
* Code, execute and debug the whole stack in the browser. Even without internet connection.
* Your data and code don’t leave your browser
* Instant reproducable environment without installation
* Easily embeddable in your code
* Client and server-side code in the browser based on standards:
  - Use module imports for scripts 
  - Send requests with fetch
  - Handle HTTP queries with the Request/Response API


## UseCases

* Create rich documentations, tutorials, demos
* Embed in your rich application - in the new generation Notion, Airtable or Figma
* Deliver self-contained prototype environments to your clients

## How It Works

The core of this module is based on the following native browser technologies: ServiceWorker and MessageChannels.

A ServiceWorker is used as the "server", intercepting HTTP calls and delegating their handling to registered modules via MessageChannels. 
So in the same browser-based application you can register a standard HTTP endpoint and call it. 

Example:
```js
import { httpService, endpointUrl } from "...";

// Server-side code:
httpService.register(async (request) => { // request: Request
  return new Response("Hello, world!", {
    headers: {
      "Content-Type": "text/plain"
    }
  })
})

// Client-side code:

const res = await fetch(endpointUrl);
const text = await res.text();
console.log(text);

```

## They Play Well Together...

This in-browser HTTP Server allows to implement the following functionalities:
- Serve your content from your Local Disk:
  - using [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
  - using [Origin Private File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- Add version control with Git - using [IsomorphicGit](https://isomorphic-git.org/)
- Provide direct P2P sharing with others – via [WebRTC](https://webrtc.org/)
- Implement client/server applications using persistent SQLite on Origin Private File System - using [SQLite Wasm](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system/)
- Deploy your local site on Edge - via [Deno Deploy](https://deno.com/deploy)
- Distribute your work in any browser via IPFS / [LibP2P](https://github.com/libp2p/js-libp2p)
- Integration with existing powerful APIs like https://trpc.io/

...and everything in the browser!
