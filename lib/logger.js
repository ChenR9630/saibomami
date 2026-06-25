// Structured logger — simple, no dependencies
const IS_PRODUCTION = process.env.PRODUCTION === "true";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL = LEVELS[process.env.LOG_LEVEL || (IS_PRODUCTION ? "info" : "debug")] ?? LEVELS.info;

function formatTime() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  if (LEVELS[level] < LEVEL) return;
  const entry = { time: formatTime(), level, message, ...(extra ? { extra } : {}) };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

module.exports = {
  debug: (message, extra) => log("debug", message, extra),
  info: (message, extra) => log("info", message, extra),
  warn: (message, extra) => log("warn", message, extra),
  error: (message, extra) => log("error", message, extra),
  LEVEL,
  LEVELS,
};
