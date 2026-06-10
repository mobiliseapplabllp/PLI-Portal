import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import usersReducer from './usersSlice';
import departmentsReducer from './departmentsSlice';
import kpiReducer from './kpiSlice';
import notificationsReducer from './notificationsSlice';
import appReducer from './appSlice';
import pmReducer from './pmSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
    departments: departmentsReducer,
    kpi: kpiReducer,
    notifications: notificationsReducer,
    app: appReducer,
    pm: pmReducer,
  },
});
