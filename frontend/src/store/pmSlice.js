import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getProjectsApi, getProjectByIdApi } from '../api/pm/projects.api';

export const fetchProjects = createAsyncThunk('pm/fetchProjects', async (params, { rejectWithValue }) => {
  try {
    const res = await getProjectsApi(params);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Failed');
  }
});

export const fetchProjectById = createAsyncThunk('pm/fetchProjectById', async (id, { rejectWithValue }) => {
  try {
    const res = await getProjectByIdApi(id);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Failed');
  }
});

const pmSlice = createSlice({
  name: 'pm',
  initialState: {
    projects: [],
    activeProject: null,
    projectsLoading: false,
    projectLoading: false,
    projectsError: null,
    projectError: null,
  },
  reducers: {
    clearActiveProject(state) { state.activeProject = null; state.projectError = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.projectsLoading = true; state.projectsError = null; })
      .addCase(fetchProjects.fulfilled, (state, action) => { state.projectsLoading = false; state.projects = action.payload || []; })
      .addCase(fetchProjects.rejected, (state, action) => { state.projectsLoading = false; state.projectsError = action.payload?.message || action.payload?.error?.message || 'Failed to load projects'; })
      .addCase(fetchProjectById.pending, (state) => { state.projectLoading = true; state.projectError = null; })
      .addCase(fetchProjectById.fulfilled, (state, action) => { state.projectLoading = false; state.activeProject = action.payload; })
      .addCase(fetchProjectById.rejected, (state, action) => { state.projectLoading = false; state.projectError = action.payload?.message || action.payload?.error?.message || 'Failed to load project'; });
  },
});

export const { clearActiveProject } = pmSlice.actions;
export default pmSlice.reducer;
