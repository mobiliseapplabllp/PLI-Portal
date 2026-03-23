import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getNotificationsApi, markAsReadApi, markAllAsReadApi } from '../api/notifications.api';

export const fetchNotifications = createAsyncThunk('notifications/fetch', async (params) => {
  const res = await getNotificationsApi(params);
  return res.data.data;
});

export const markRead = createAsyncThunk('notifications/markRead', async (id) => {
  await markAsReadApi(id);
  return id;
});

export const markAllRead = createAsyncThunk('notifications/markAllRead', async () => {
  await markAllAsReadApi();
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: { list: [], unreadCount: 0, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.list = action.payload.notifications;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(markRead.fulfilled, (state, action) => {
        const n = state.list.find((x) => x._id === action.payload);
        if (n && !n.isRead) {
          n.isRead = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllRead.fulfilled, (state) => {
        state.list.forEach((n) => { n.isRead = true; });
        state.unreadCount = 0;
      });
  },
});

export default notificationsSlice.reducer;
