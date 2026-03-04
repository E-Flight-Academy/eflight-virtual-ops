/**
 * Lightweight structured logger.
 * Outputs JSON in production for log aggregation, readable text in dev.
 */

const isProd = process.env.NODE_ENV === "production";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry) {
  if (isProd) {
    // JSON for log aggregation
    const output = JSON.stringify(entry);
    if (entry.level === "error") console.error(output);
    else if (entry.level === "warn") console.warn(output);
    else console.log(output);
  } else {
    // Readable for dev
    const { level, msg, ...rest } = entry;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    const prefix = level === "error" ? "✗" : level === "warn" ? "⚠" : "→";
    if (level === "error") console.error(`${prefix} ${msg}${extra}`);
    else if (level === "warn") console.warn(`${prefix} ${msg}${extra}`);
    else console.log(`${prefix} ${msg}${extra}`);
  }
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    emit({ level: "info", msg, ...data });
  },
  warn(msg: string, data?: Record<string, unknown>) {
    emit({ level: "warn", msg, ...data });
  },
  error(msg: string, data?: Record<string, unknown>) {
    emit({ level: "error", msg, ...data });
  },
};

/**
 * Measure and log API route duration.
 * Usage: const done = apiTimer("POST /api/chat"); ... done();
 */
export function apiTimer(route: string) {
  const start = Date.now();
  return (extra?: Record<string, unknown>) => {
    const durationMs = Date.now() - start;
    logger.info(`${route} completed`, { durationMs, ...extra });
  };
}
