const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Department = require('../models/Department');
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
  const where = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { employeeCode: identifier.toUpperCase() };

  const user = await User.findOne({
    where,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
  });

  if (!user) {
    throw new UnauthorizedError('Invalid credentials. Use your email or employee ID.');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated. Contact admin.');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'login',
    changedBy: user.id,
    ipAddress,
  });

  const plain = user.get({ plain: true });
  delete plain.passwordHash;

  return {
    token,
    refreshToken,
    user: plain,
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findByPk(userId);
  if (!user) throw new UnauthorizedError('User not found');

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) throw new UnauthorizedError('Current password is incorrect');

  user.passwordHash = newPassword;
  user.mustChangePassword = false;
  await user.save();

  await createAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'password_changed',
    changedBy: user.id,
  });

  return true;
};

module.exports = { login, changePassword, generateToken };
