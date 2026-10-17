const { sendJson } = require('./_utils');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
  }
  const canonicalHost = req.headers.host === 'www.getpraxora.com';
  return sendJson(res, 200, {
    gaMeasurementId: canonicalHost ? process.env.PRAXORA_GA_MEASUREMENT_ID || '' : ''
  });
};
