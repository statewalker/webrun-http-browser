export function serializeError(error) {
  return Object.assign({
    message: error,
    stack: error.stack,
  }, error);
}

export function deserializeError(error) {
  if (typeof error === "string")
    error = { message: error };
  return Object.assign(new Error(error.message), error);
}
