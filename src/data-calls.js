import { deserializeError, serializeError } from "./errors.js";

export async function callChannel(mainChannel, callType, params, ...transfers) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (ev) => {
      const { result, error } = ev.data;
      if (error) reject(deserializeError(error));
      else resolve(result);
    };
    mainChannel.postMessage({ type: callType, params }, [
      channel.port2,
      ...transfers,
    ]);
  });
}

export function handleChannelCalls(mainChannel, callType, handler) {
  const messageListener = async (event) => {
    if (!event.data || event.data.type !== callType) return;
    const [port, ...transfers] = event.ports;
    let response = {};
    try {
      const params = event.data.params;
      response.result = await handler(event, params, ...transfers);
    } catch (error) {
      response.error = serializeError(error);
    }
    port.postMessage(response);
  };
  mainChannel.addEventListener("message", messageListener);
  try {
    mainChannel.start && mainChannel.start();
  } catch (e) {}
  return () => mainChannel.removeEventListener("message", messageListener);
}
