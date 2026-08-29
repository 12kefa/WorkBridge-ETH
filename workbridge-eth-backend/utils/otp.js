// Lazy-load optional deps so the app still boots if they're not installed.
let speakeasy = null;
let qrcode = null;
try { speakeasy = require('speakeasy'); } catch (e) { /* missing */ }
try { qrcode = require('qrcode'); } catch (e) { /* missing */ }

const ISSUER = 'WorkBridge ETH';

const generateOTP = () => {
  if (!speakeasy) {
    throw new Error('speakeasy not installed. Run `npm install speakeasy qrcode`.');
  }
  const secret = speakeasy.generateSecret({
    name: ISSUER,
    length: 20
  });
  return secret;
};

const verifyOTP = (token, secret) => {
  if (!speakeasy) return false;
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1
  });
};

const generateQrDataURL = async (otpauthUrl) => {
  if (!qrcode) return null;
  return qrcode.toDataURL(otpauthUrl);
};

module.exports = { generateOTP, verifyOTP, generateQrDataURL };
