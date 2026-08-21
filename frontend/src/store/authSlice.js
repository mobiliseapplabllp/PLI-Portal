import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getMeApi, logoutApi, requestOtpApi, verifyOtpApi } from '../api/auth.api';

// Sign-in is email-OTP only: request a code, then verify it.
export const requestOtp = createAsyncThunk('auth/requestOtp', async (identifier, { rejectWithValue }) => {
  try {
    const res = await requestOtpApi(identifier);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Could not send the code');
  }
});

export const verifyOtp = createAsyncThunk('auth/verifyOtp', async ({ identifier, code }, { rejectWithValue }) => {
  try {
    const res = await verifyOtpApi(identifier, code);
    const { token, user } = res.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    return { token, user };
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Invalid code');
  }
});

export const loadUser = createAsyncThunk('auth/loadUser', async (_, { rejectWithValue }) => {
  try {
    const res = await getMeApi();
    return res.data.data;
  } catch (err) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return rejectWithValue('Session expired');
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await logoutApi();
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
});

// A corrupt localStorage entry must not take the whole app down at import time
const readStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: readStoredUser(),
    token: localStorage.getItem('token') || null,
    loading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // OTP verification is the only sign-in path
      .addCase(verifyOtp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyOtp.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Load user
      .addCase(loadUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(loadUser.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.token = null;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.token = null;
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
