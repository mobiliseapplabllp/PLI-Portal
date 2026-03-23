import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUsersApi, createUserApi, updateUserApi, getTeamApi } from '../api/users.api';

export const fetchUsers = createAsyncThunk('users/fetchAll', async (params) => {
  const res = await getUsersApi(params);
  return res.data;
});

export const createUser = createAsyncThunk('users/create', async (data, { rejectWithValue }) => {
  try {
    const res = await createUserApi(data);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed');
  }
});

export const updateUser = createAsyncThunk('users/update', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await updateUserApi(id, data);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed');
  }
});

export const fetchTeam = createAsyncThunk('users/fetchTeam', async (managerId) => {
  const res = await getTeamApi(managerId);
  return res.data.data;
});

const usersSlice = createSlice({
  name: 'users',
  initialState: {
    list: [],
    team: [],
    pagination: null,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => { state.loading = true; })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchTeam.fulfilled, (state, action) => {
        state.team = action.payload;
      });
  },
});

export default usersSlice.reducer;
