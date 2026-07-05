const { sendJson } = require('./_utils');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
  }
  return sendJson(res, 200, {
    gaMeasurementId: process.env.PRAXORA_GA_MEASUREMENT_ID || ''
  });
};
