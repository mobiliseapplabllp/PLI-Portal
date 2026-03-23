import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getAssignmentsApi, getAssignmentByIdApi } from '../api/kpiAssignments.api';

export const fetchAssignments = createAsyncThunk('kpi/fetchAssignments', async (params) => {
  const res = await getAssignmentsApi(params);
  return res.data;
});

export const fetchAssignmentDetail = createAsyncThunk('kpi/fetchDetail', async (id) => {
  const res = await getAssignmentByIdApi(id);
  return res.data.data;
});

const kpiSlice = createSlice({
  name: 'kpi',
  initialState: {
    assignments: [],
    pagination: null,
    currentAssignment: null,
    currentItems: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearCurrent: (state) => {
      state.currentAssignment = null;
      state.currentItems = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssignments.pending, (state) => { state.loading = true; })
      .addCase(fetchAssignments.fulfilled, (state, action) => {
        state.loading = false;
        state.assignments = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAssignments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchAssignmentDetail.pending, (state) => { state.loading = true; })
      .addCase(fetchAssignmentDetail.fulfilled, (state, action) => {
        state.loading = false;
        state.currentAssignment = action.payload.assignment;
        state.currentItems = action.payload.items;
      })
      .addCase(fetchAssignmentDetail.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export const { clearCurrent } = kpiSlice.actions;
export default kpiSlice.reducer;
