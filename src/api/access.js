'use strict';

/**
 * Who may talk to the local apply server.
 *
 * The server fills real forms with the user's personal data, so it must not be
 * drivable by arbitrary websites (CORS) or other machines on the network (bind address).
 */

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function allowedOrigins(env) {
  if (!env.DASHBOARD_ORIGIN) return DEFAULT_ORIGINS;
  return env.DASHBOARD_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Requests without an Origin header (curl, this server calling itself) are not
 * browser cross-site requests, so they are allowed.
 */
function isOriginAllowed(origin, env = process.env) {
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}

function createCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, env));
    },
  };
}

/** Loopback by default; the Docker image sets HOST=0.0.0.0. */
function resolveHost(env = process.env) {
  return env.HOST || '127.0.0.1';
}

module.exports = { isOriginAllowed, createCorsOptions, resolveHost };
