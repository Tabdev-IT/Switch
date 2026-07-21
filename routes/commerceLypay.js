const express = require('express');
const crypto = require('crypto');
const commerceLypayService = require('../services/commerceLypayService');
const log = require('../utils/logger');

const router = express.Router();

/** Authorization header = raw token (optional "Bearer " prefix still accepted). */
function extractAuthToken(authHeader) {
  if (!authHeader) return '';
  const value = String(authHeader).trim();
  if (/^bearer\s+/i.test(value)) {
    return value.replace(/^bearer\s+/i, '').trim();
  }
  return value;
}

function commerceTokenAuth(req, res, next) {
  // Prefer env; fall back to a fixed UAT/dev token so the API is usable without .env.
  const expected = (
    process.env.COMMERCE_LYPAY_TOKEN ||
    process.env.COMMERCE_LYPAY_BEARER_TOKEN ||
    '2dc9bb48a314e32142e8c2dc650be86d9445f9b1a262895851d2bd026cf6a4d1'
  ).trim();

  const provided = extractAuthToken(req.headers.authorization);
  if (!provided) {
    return res.status(401).json({
      status: { code: 'UNAUTHORIZED', errorInfo: { Message: 'Missing Authorization token' } }
    });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      status: { code: 'UNAUTHORIZED', errorInfo: { Message: 'Invalid authorization token' } }
    });
  }
  next();
}

router.use(commerceTokenAuth);

router.post('/initiate', async (req, res) => {
  try {
    const envelope = await commerceLypayService.initiate(req.body || {});
    return res.status(200).json(envelope);
  } catch (err) {
    log(`commerce_lypay initiate fault: ${err.message}`);
    return res.status(500).json({
      status: { code: 'BANK_ERROR', errorInfo: { Message: 'Internal bank error' } }
    });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const envelope = await commerceLypayService.confirm(req.body || {});
    return res.status(200).json(envelope);
  } catch (err) {
    log(`commerce_lypay confirm fault: ${err.message}`);
    return res.status(500).json({
      status: { code: 'BANK_ERROR', errorInfo: { Message: 'Internal bank error' } }
    });
  }
});

router.post('/status', async (req, res) => {
  try {
    const envelope = await commerceLypayService.status(req.body || {});
    return res.status(200).json(envelope);
  } catch (err) {
    log(`commerce_lypay status fault: ${err.message}`);
    return res.status(500).json({
      status: { code: 'BANK_ERROR', errorInfo: { Message: 'Internal bank error' } }
    });
  }
});

module.exports = router;
