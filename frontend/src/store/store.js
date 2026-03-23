import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import usersReducer from './usersSlice';
import departmentsReducer from './departmentsSlice';
import kpiReducer from './kpiSlice';
import notificationsReducer from './notificationsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
    departments: departmentsReducer,
    kpi: kpiReducer,
    notifications: notificationsReducer,
  },
});
