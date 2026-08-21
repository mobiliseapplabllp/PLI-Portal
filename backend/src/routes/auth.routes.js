const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { logout, getMe, requestOtp, verifyOtp } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { otpRequestValidator, otpVerifyValidator } = require('../validators/auth.validator');

// Authentication is email-OTP only — there is no password endpoint.
// These two routes are unauthenticated and one of them sends mail, so both are
// throttled per IP. Per-account throttling lives in auth.service.
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many code requests. Please try again in a few minutes.' } },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again in a few minutes.' } },
});

// Tombstone: password sign-in was removed in favour of OTP (migration 013).
router.post('/login', (req, res) =>
  res.status(410).json({
    success: false,
    error: { message: 'Password sign-in has been discontinued. Please sign in with the code sent to your email.' },
  })
);

router.post('/otp/request', otpRequestLimiter, otpRequestValidator, validate, requestOtp);
router.post('/otp/verify', otpVerifyLimiter, otpVerifyValidator, validate, verifyOtp);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

module.exports = router;
