import api from './axios';

// Authentication is email-OTP only — a 6-digit code is sent to the account's
// registered email address. There is no password endpoint.
export const requestOtpApi = (identifier) => api.post('/auth/otp/request', { identifier });
export const verifyOtpApi = (identifier, code) => api.post('/auth/otp/verify', { identifier, code });

export const logoutApi = () => api.post('/auth/logout');
export const getMeApi = () => api.get('/auth/me');
