const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const User = require('../models/User');
const Department = require('../models/Department');
const LoginOtp = require('../models/LoginOtp');
const { UnauthorizedError, ValidationError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendLoginOtpEmail } = require('../utils/emailService');
const { OTP_CONFIG } = require('../config/constants');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Authentication is EMAIL-OTP ONLY. There is no password sign-in path; the
// users.passwordHash column is retained but never read (see migration 013).
//
// Defence in depth, in the order an attacker meets it:
//   1. Per-IP rate limits on both endpoints            (routes/auth.routes.js)
//   2. Per-account request throttle                    (assertRequestQuota)
//   3. Uniform responses + constant-ish timing         (no account enumeration)
//   4. CSPRNG codes, bcrypt-hashed at rest, single use (never stored/logged raw)
//   5. Short TTL, capped attempts, lockout on abuse    (verifyLoginOtp)
// ─────────────────────────────────────────────────────────────────────────────

const departmentInclude = [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }];

// A throwaway hash used to burn the same CPU time as a real bcrypt.compare when
// the account does not exist, so response time cannot be used to probe accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

// Identifier is either an email or an employee code — matches the login form.
const findByIdentifier = (identifier) => {
  const value = String(identifier || '').trim();
  if (!value) return null;
  const where = value.includes('@')
    ? { email: value.toLowerCase() }
    : { employeeCode: value.toUpperCase() };
  return User.findOne({ where, include: departmentInclude });
};

/**
 * Per-account throttle. Rate limiting by IP alone is defeated by rotating IPs,
 * so the account itself carries a budget: MAX_PER_HOUR codes, and a cooldown
 * once codes have been burned by wrong guesses.
 */
const assertRequestQuota = async (userId) => {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const locked = await LoginOtp.findOne({
    where: { userId, lockedUntil: { [Op.gt]: new Date() } },
    order: [['lockedUntil', 'DESC']],
  });
  if (locked) {
    const mins = Math.max(1, Math.ceil((locked.lockedUntil - Date.now()) / 60000));
    throw new ValidationError(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  const recent = await LoginOtp.count({ where: { userId, createdAt: { [Op.gt]: hourAgo } } });
  if (recent >= OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
    throw new ValidationError('Too many sign-in codes requested. Please try again later.');
  }
};

// Shared tail of a successful sign-in.
const completeLogin = async (user, ipAddress) => {
  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'login',
    changedBy: user.id,
    newValue: { method: 'otp' },
    ipAddress,
  });

  logger.success(`Login (otp): ${user.name} (${user.employeeCode} · ${user.role}) from ${ipAddress}`);

  const plain = user.get({ plain: true });
  delete plain.passwordHash;

  return { token, refreshToken, user: plain };
};

/**
 * Issue a one-time passcode to the account's registered email.
 *
 * Responds identically whether or not the account exists, so this endpoint
 * cannot be used to discover valid emails or employee codes.
 */
const requestLoginOtp = async (identifier, ipAddress) => {
  const generic = {
    expiresInMinutes: OTP_CONFIG.TTL_MINUTES,
    resendAfterSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
  };
  const user = await findByIdentifier(identifier);

  if (!user || !user.isActive || !user.email) {
    // Burn comparable time, then answer exactly as we would for a real account.
    await bcrypt.compare('timing-equaliser', DUMMY_HASH);
    logger.warn(`OTP requested for unknown/inactive account: "${identifier}" from ${ipAddress}`);
    return generic;
  }

  await assertRequestQuota(user.id);

  // Supersede anything still outstanding — only the newest code can ever work.
  await LoginOtp.update({ consumedAt: new Date() }, { where: { userId: user.id, consumedAt: null } });

  // crypto.randomInt is a CSPRNG — Math.random is unsuitable for credentials.
  const code = String(crypto.randomInt(0, 10 ** OTP_CONFIG.LENGTH)).padStart(OTP_CONFIG.LENGTH, '0');

  await LoginOtp.create({
    userId: user.id,
    codeHash: await bcrypt.hash(code, 10), // the raw code is never stored or logged
    expiresAt: new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000),
    ipAddress,
  });

  try {
    await sendLoginOtpEmail(user.email, user.name, code, OTP_CONFIG.TTL_MINUTES);
    logger.success(`OTP sent: ${user.name} (${user.employeeCode}) from ${ipAddress}`);
  } catch (err) {
    logger.warn(`OTP email failed for ${user.employeeCode}: ${err.message}`);
    throw new ValidationError('Could not send the code by email. Please contact your administrator.');
  }

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'otp_requested',
    changedBy: user.id,
    ipAddress,
  });

  return generic;
};

/** Verify a passcode and sign the user in. */
const verifyLoginOtp = async (identifier, code, ipAddress) => {
  // One message for every failure mode below — never reveals which step failed.
  const invalid = () => new UnauthorizedError('Invalid or expired code. Please request a new one.');

  const user = await findByIdentifier(identifier);
  if (!user || !user.isActive) {
    await bcrypt.compare(String(code), DUMMY_HASH);
    logger.warn(`OTP verify failed — unknown/inactive account: "${identifier}" from ${ipAddress}`);
    throw invalid();
  }

  const otp = await LoginOtp.findOne({
    where: { userId: user.id, consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  });
  if (!otp) {
    await bcrypt.compare(String(code), DUMMY_HASH);
    logger.warn(`OTP verify failed — no active code: ${user.employeeCode} from ${ipAddress}`);
    throw invalid();
  }

  if (otp.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    await otp.update({
      consumedAt: new Date(),
      lockedUntil: new Date(Date.now() + OTP_CONFIG.LOCKOUT_MINUTES * 60 * 1000),
    });
    logger.warn(`OTP verify failed — attempts exhausted: ${user.employeeCode} from ${ipAddress}`);
    throw new UnauthorizedError('Too many incorrect attempts. Please request a new code shortly.');
  }

  const isMatch = await bcrypt.compare(String(code), otp.codeHash);
  if (!isMatch) {
    const attempts = otp.attempts + 1;
    const exhausted = attempts >= OTP_CONFIG.MAX_ATTEMPTS;
    await otp.update({
      attempts,
      // Burn the code and start a cooldown once the budget is spent
      ...(exhausted
        ? {
            consumedAt: new Date(),
            lockedUntil: new Date(Date.now() + OTP_CONFIG.LOCKOUT_MINUTES * 60 * 1000),
          }
        : {}),
    });
    const left = OTP_CONFIG.MAX_ATTEMPTS - attempts;
    logger.warn(`OTP verify failed — wrong code: ${user.employeeCode} from ${ipAddress} (${left} left)`);
    throw new UnauthorizedError(
      exhausted
        ? 'Too many incorrect attempts. Please request a new code shortly.'
        : `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
    );
  }

  await otp.update({ consumedAt: new Date() }); // single use — burned on success
  return completeLogin(user, ipAddress);
};

/** Housekeeping: drop consumed/expired codes. Called by the daily cron. */
const purgeExpiredOtps = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return LoginOtp.destroy({
    where: {
      expiresAt: { [Op.lt]: cutoff },
      [Op.or]: [{ lockedUntil: null }, { lockedUntil: { [Op.lt]: new Date() } }],
    },
  });
};

module.exports = { generateToken, requestLoginOtp, verifyLoginOtp, purgeExpiredOtps };
