import { createSlice } from '@reduxjs/toolkit';

const stored = localStorage.getItem('pli_active_module');

const appSlice = createSlice({
  name: 'app',
  initialState: {
    activeModule: stored === 'pm' ? 'pm' : 'kpi',
  },
  reducers: {
    setActiveModule(state, action) {
      state.activeModule = action.payload;
      localStorage.setItem('pli_active_module', action.payload);
    },
  },
});

export const { setActiveModule } = appSlice.actions;
export default appSlice.reducer;
