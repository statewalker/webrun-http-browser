import { serializeError, deserializeError } from "./errors.js";
import { recieveData, sendData } from "./data-send-recieve.js";

export async function* sendStream(communicationPort, input, params = {}) {
  const messageChannel = new MessageChannel();
  communicationPort.postMessage({ type: "START_CALL", params }, [
    messageChannel.port2,
  ]);

  const channel = newChannel(messageChannel.port1);
  try {
    await channel.start();
    channel.sendAll(input);
    yield* channel.recieveAll();
  } finally {
    await channel.close();
  }
}

export function handleStreams(communicationPort, handler) {
  const listener = async (event) => {
    const { type, params } = event.data || {};
    if (type !== "START_CALL") return;
    const port = event.ports[0];
    const channel = newChannel(port);
    try {
      await channel.start();
      const input = channel.recieveAll();
      const response = await handler(input, params);
      await channel.sendAll(response);
    } finally {
      await channel.close();
    }
  };
  communicationPort.addEventListener("message", listener);
  try { communicationPort.start && communicationPort.start(); } catch (e) {}
  return () => communicationPort.removeEventListener("message", listener);;
}

/**
 * This method creates and returns methods allowing to send and recieve data over the specified port.
 * The main characteristics of the returned methods is that they properly manage backpressure - sender
 * iterators are waiting to send the next value until the previous one is consumed on the other side.
 * @param {*} port
 * @returns an object with the following methods:
 *  * `start` - starts the connection over the specified port
 *  * `close`- stops all iterators and closes the port
 *  * `recieveAll() : AsyncIterator` - returns an AsyncIterator over all values send by the peer
 *  * `sendAll(it : AsyncIterator) : Promise<any>` - sends all values defined by the given
 *     AsyncIterator to the peer
 */
export function newChannel(port) {
  let listeners = [];
  let iterators = [];

  const notifyAll = async (data) => {
    for (let listener of listeners) {
      await listener(data);
    }
  };
  const channel = newInvokationChannel(port, notifyAll);

  const start = () => channel.start();

  const close = async () => {
    await notifyAll({ done: true });
    [...iterators].forEach(it => it.return && it.return());
    await channel.close();
  };

  async function* recieveAll() {
    yield* recieveData((listener) => {
      listeners.push(listener);
      return () => listeners = listeners.filter((l) => l !== listener);
    });
  }

  async function sendAll(it) {
    await sendData(
      channel.invoke,
      (async function* () {
        try {
          iterators.push(it);
          yield* it;
        } finally {
          iterators = iterators.filter((i) => i !== it);
        }
      })()
    );
  }
  return {
    start,
    close,
    recieveAll,
    sendAll,
  };
}

export function newInvokationChannel(port, handler = () => {
  throw new Error("Handler not implemented");
}) {
  const MESSAGE_TYPE_REQUEST = "REQUEST";
  const MESSAGE_TYPE_RESPONSE = "RESPONSE";
  const EVENT_MESSAGE = "message";
  
  const requests = {};
  let requestCounter = 0;
  const listener = async (event) => {
    const data = event.data || {};
    const { type } = data;
    if (type === MESSAGE_TYPE_REQUEST) {
      try {
        const { callId, request } = data;
        let result = await handler(request, ...(event.ports || []));
        const [response, ...transfers] = Array.isArray(result)
          ? result
          : result !== undefined ? [result] : [];
        port.postMessage({ type: MESSAGE_TYPE_RESPONSE, callId, response }, transfers);
      } catch (error) {
        port.postMessage({
          type: MESSAGE_TYPE_RESPONSE,
          callId,
          error: serializeError(error),
        });
      }
    } else if (type === MESSAGE_TYPE_RESPONSE) {
      const { callId, response, error } = data;
      const request = requests[callId];
      delete requests[callId];
      if (request) {
        error
          ? request.reject(deserializeError(error))
          : request.resolve(response);
      }
    }
  };

  const start = async () => {
    port.addEventListener(EVENT_MESSAGE, listener);
    await port.start();
  };

  const close = async () => {
    port.removeEventListener(EVENT_MESSAGE, listener);
    await port.close();
  };

  const invoke = async function (request = {}, ...transfers) {
    const callId = ++requestCounter;
    return new Promise((resolve, reject) => {
      try {
        requests[callId] = { resolve, reject };
        port.postMessage({ type: MESSAGE_TYPE_REQUEST, callId, request }, transfers);
      } catch (error) {
        reject(error);
        delete request[callId];
      }
    });
  };

  return {
    start,
    close,
    invoke,
  };
}

