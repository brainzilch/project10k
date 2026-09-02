// Runs at server boot (Next.js instrumentation hook). Also compiled for the
// edge runtime (middleware), where process.on and node modules do not exist -
// everything below lives inside a NEXT_RUNTIME === "nodejs" branch so the
// bundler drops it (and the report import) from the edge build entirely.
// A single-user always-on app should log-and-survive rather than crash-loop:
// Node's default kills the process on any unhandled rejection, which turns a
// stray background error into full downtime on Railway.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      console.error(
        `[climb] unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`,
      );
    });
    process.on("uncaughtException", (error) => {
      console.error(`[climb] uncaught exception: ${error.stack ?? error.message}`);
    });

    // Scheduler: every 5 minutes run the report / dev-story / push ticks (each
    // guards its own cadence). Report: check whether a PROJECT 10K report
    // draft is due (weekly / milestone, generated in the 20:00 JST hour).
    // Guarded against double registration across hot reloads.
    const g = globalThis as {
      __climbReportTimer?: ReturnType<typeof setInterval>;
    };
    if (!g.__climbReportTimer) {
      g.__climbReportTimer = setInterval(() => {
        import("./lib/report")
          .then((m) => m.autoReportTick())
          .catch((e) =>
            console.error(
              `[climb] report tick failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
        import("./lib/devstory")
          .then((m) => m.autoDevStoryTick())
          .catch((e) =>
            console.error(
              `[climb] dev story tick failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
        import("./lib/coachRun")
          .then((m) => m.autoCoachTick())
          .catch((e) =>
            console.error(
              `[climb] coach tick failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
        import("./lib/push")
          .then((m) => m.pushTick())
          .catch((e) =>
            console.error(
              `[climb] push tick failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
      }, 5 * 60 * 1000);
    }
  }
}
