const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
};

const login = async (identifier, password, ipAddress) => {
  // Allow login by email OR employee code (case-insensitive)
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { employeeCode: identifier.toUpperCase() };

  const user = await User.findOne(query).populate('department', 'name code');

  if (!user) {
    throw new UnauthorizedError('Invalid credentials. Use your email or employee ID.');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated. Contact admin.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  await createAuditLog({
    entityType: 'user',
    entityId: user._id,
    action: 'login',
    changedBy: user._id,
    ipAddress,
  });

  return {
    token,
    refreshToken,
    user: user.toJSON(),
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('User not found');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new UnauthorizedError('Current password is incorrect');

  user.passwordHash = newPassword; // pre-save hook will hash it
  user.mustChangePassword = false;
  await user.save();

  await createAuditLog({
    entityType: 'user',
    entityId: user._id,
    action: 'password_changed',
    changedBy: user._id,
  });

  return true;
};

module.exports = { login, changePassword, generateToken };
