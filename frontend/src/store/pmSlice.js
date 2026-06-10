import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getProjectsApi, getProjectByIdApi } from '../api/pm/projects.api';

export const fetchProjects = createAsyncThunk('pm/fetchProjects', async (params, { rejectWithValue }) => {
  try {
    const res = await getProjectsApi(params);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed to load projects');
  }
});

export const fetchProjectById = createAsyncThunk('pm/fetchProjectById', async (id, { rejectWithValue }) => {
  try {
    const res = await getProjectByIdApi(id);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Failed to load project');
  }
});

const pmSlice = createSlice({
  name: 'pm',
  initialState: {
    projects: [],
    activeProject: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearActiveProject(state) { state.activeProject = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchProjects.fulfilled, (state, action) => { state.loading = false; state.projects = action.payload || []; })
      .addCase(fetchProjects.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchProjectById.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchProjectById.fulfilled, (state, action) => { state.loading = false; state.activeProject = action.payload; })
      .addCase(fetchProjectById.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearActiveProject } = pmSlice.actions;
export default pmSlice.reducer;
