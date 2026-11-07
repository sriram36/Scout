'use strict';

/**
 * Request schemas and validation middleware for the local apply server.
 */

const { z } = require('zod');

const httpUrl = z.string().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch (_) {
    return false;
  }
}, 'Must be a valid http(s) URL');

const applyBodySchema = z.object({
  url:         httpUrl,
  jobId:       z.string().min(1).optional(),
  title:       z.string().default(''),
  company:     z.string().default(''),
  description: z.string().default(''),
});

const correctionBodySchema = z.object({
  platform:       z.string().min(1).default('generic'),
  domain:         z.string().optional(),
  fieldSignature: z.string().min(1),
  meaning:        z.string().min(1),
  confidence:     z.number().min(0).max(1).default(1),
});

/**
 * Express middleware: validate req.body against a zod schema.
 * On success req.body becomes the parsed value; on failure responds 400.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request',
        issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { applyBodySchema, correctionBodySchema, validateBody };
