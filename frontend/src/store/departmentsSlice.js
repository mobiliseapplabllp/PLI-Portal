import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getDepartmentsApi, createDepartmentApi, updateDepartmentApi } from '../api/departments.api';

export const fetchDepartments = createAsyncThunk('departments/fetchAll', async (params) => {
  const res = await getDepartmentsApi(params);
  return res.data.data;
});

export const createDepartment = createAsyncThunk('departments/create', async (data, { rejectWithValue }) => {
  try {
    const res = await createDepartmentApi(data);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed');
  }
});

export const updateDepartment = createAsyncThunk('departments/update', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await updateDepartmentApi(id, data);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed');
  }
});

const departmentsSlice = createSlice({
  name: 'departments',
  initialState: { list: [], loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDepartments.pending, (state) => { state.loading = true; })
      .addCase(fetchDepartments.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchDepartments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default departmentsSlice.reducer;
