import { iterate } from "@statewalker/utils";

export async function* recieveData(onMessage) {
  yield* iterate((iterator) => {
    return onMessage(async ({ done = true, value, error } = {}) => {
      if (error) {
        await iterator.error(error);
      } else if (done) {
        await iterator.complete();
      } else {
        await iterator.next(value);
      }
    });
  });
}

export async function sendData(send, it) {
  let error;
  try {
    for await (let value of it) {
      await send({ done: false, value });
    }
  } catch (err) {
    error = err;
  } finally {
    await send({ done: true, error });
  }
}
