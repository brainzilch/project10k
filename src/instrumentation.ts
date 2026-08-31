// Runs at server boot (Next.js instrumentation hook). Also invoked in the
// edge runtime for middleware, where process.on does not exist - register the
// handlers only in the Node.js runtime.
// A single-user always-on app should log-and-survive rather than crash-loop:
// Node's default kills the process on any unhandled rejection, which turns a
// stray background error into full downtime on Railway.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.on("unhandledRejection", (reason) => {
    console.error(
      `[climb] unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`,
    );
  });
  process.on("uncaughtException", (error) => {
    console.error(`[climb] uncaught exception: ${error.stack ?? error.message}`);
  });
}
