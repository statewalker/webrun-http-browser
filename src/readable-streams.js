export function toReadableStream(it) {
  return new ReadableStream({
    type: "bytes",
    async pull(controller) {
      let handled = false;
      try {
        while (true) {
          const slot = await it.next();
          if (!slot || slot.done)
            break;
          controller.enqueue(await slot.value);
        }
      } catch (error) {
        handled = true;
        controller.error(error);
      } finally {
        !handled && controller.close();
      }
    },
  });
}

export async function* fromReadableStream(stream) {
  const reader = await stream.getReader();
  let done, value;
  while (({ done, value } = await reader.read())) {
    if (done) {
      break;
    }
    yield await value;
  }
}
