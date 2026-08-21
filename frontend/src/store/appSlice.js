import { createSlice } from '@reduxjs/toolkit';

// Top-level applications the shell can switch between.
export const MODULE_IDS = ['kpi', 'pm', 'roster'];

const stored = localStorage.getItem('pli_active_module');

const appSlice = createSlice({
  name: 'app',
  initialState: {
    activeModule: MODULE_IDS.includes(stored) ? stored : 'kpi',
  },
  reducers: {
    setActiveModule(state, action) {
      if (!MODULE_IDS.includes(action.payload)) return;
      state.activeModule = action.payload;
      localStorage.setItem('pli_active_module', action.payload);
    },
  },
});

export const { setActiveModule } = appSlice.actions;
export default appSlice.reducer;
