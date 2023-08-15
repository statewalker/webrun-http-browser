export class HttpError extends Error {
  constructor(options) {
    super(options.message);
    this.status = options.status;
    this.statusText = options.statusText;
  }
  getResponseOptions(options = {}) {
    return Object.assign(this.toJson(), options);
  }
  toJson() {
    return {
      status: this.status,
      statusText: this.statusText,
      message: this.message,
    };
  }

  static fromError(error) {
    if (!(error instanceof HttpError)) {
      error = new HttpError(Object.assign({
        status: 500,
        statusText: "Bad Request",
        reason: error.message,
      }));
    }
    return error;
  }

  static errorResourceNotFound(options = {}) {
    return new HttpError({
      status: 404,
      statusText: "Error 404: Resource not found",
      ...options,
    });
  }
  static errorForbidden(options = {}) {
    return new HttpError({
      status: 403,
      statusText: "Error 403: Forbidden",
      ...options,
    });
  }

  static errorResourceGone(options = {}) {
    return new HttpError({
      status: 410,
      statusText: "Error 410: Resource Gone",
      ...options,
    });
  }

  static errorInternalError(options) {
    return new HttpError({
      ...options,
      status: 500,
      statusText: "Error 500: Internal error",
    });
  }
}
