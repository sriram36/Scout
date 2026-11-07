'use strict';

/**
 * Structured logger for Scout.
 * All output is JSON-per-line in production, human-readable in development.
 * NEVER log profile PII or API keys.
 */

const isDev = process.env.NODE_ENV !== 'production';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? (isDev ? LEVELS.debug : LEVELS.info);

function emit(level, message, context = {}) {
  if (LEVELS[level] < currentLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
  };

  if (isDev) {
    const color = { debug: '\x1b[37m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[level];
    const reset = '\x1b[0m';
    const ctx = Object.keys(context).length ? ' ' + JSON.stringify(context) : '';
    const out = `${color}[${level.toUpperCase()}]${reset} ${message}${ctx}`;
    level === 'error' ? console.error(out) : console.log(out);
  } else {
    (level === 'error' ? console.error : console.log)(JSON.stringify(entry));
  }
}

const logger = {
  debug: (msg, ctx) => emit('debug', msg, ctx),
  info:  (msg, ctx) => emit('info',  msg, ctx),
  warn:  (msg, ctx) => emit('warn',  msg, ctx),
  error: (msg, ctx) => emit('error', msg, ctx),

  /** Create a child logger with a fixed context prefix */
  child(fixedCtx) {
    return {
      debug: (msg, ctx) => emit('debug', msg, { ...fixedCtx, ...ctx }),
      info:  (msg, ctx) => emit('info',  msg, { ...fixedCtx, ...ctx }),
      warn:  (msg, ctx) => emit('warn',  msg, { ...fixedCtx, ...ctx }),
      error: (msg, ctx) => emit('error', msg, { ...fixedCtx, ...ctx }),
    };
  },
};

module.exports = logger;
