import * as workerTimer from "https://unpkg.com/worker-timers@7.0.74/build/es2019/module.js?module";

export function startHeartbit({
  timeout = 10 * 1000,
  url = "./ping", // 10 seconds
}) {
  return callPeriodically(async () => {
    const res = await fetch(url);
  }, timeout);
}

export async function callPeriodically(action, timeout) {
  let timerId, stopped = false;
  async function run() {
    try {
      await action();
    } catch (err) {
      console.error(err);
    }
    timerId = (!stopped) ? workerTimer.setTimeout(run, timeout) : 0;
  }
  run();
  return () => {
    stopped = true;
    if (timerId) {
      workerTimer.clearTimeout(timerId);
      timerId = 0;
    }
  };
}
