const express = require('express');
const crypto = require('crypto');
const commerceLypayService = require('../services/commerceLypayService');
const log = require('../utils/logger');

const router = express.Router();

function commerceBearerAuth(req, res, next) {
  const expected = process.env.COMMERCE_LYPAY_BEARER_TOKEN || '';
  if (!expected) {
    return res.status(503).json({
      status: { code: 'BANK_ERROR', errorInfo: { Message: 'Commerce API not configured' } }
    });
  }

  const header = (req.headers.authorization || '').trim();
  if (!header) {
    return res.status(401).json({
      status: { code: 'UNAUTHORIZED', errorInfo: { Message: 'Missing Authorization token' } }
    });
  }

  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : header;
  const a = Buffer.from(provided);
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      status: { code: 'UNAUTHORIZED', errorInfo: { Message: 'Invalid authorization token' } }
    });
  }
  next();
}

router.use(commerceBearerAuth);

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
