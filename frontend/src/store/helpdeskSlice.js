import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getTicketsApi,
  getTicketByIdApi,
  createTicketApi,
  updateTicketApi,
  deleteTicketApi,
  bulkAssignTicketsApi,
  getGroupsApi,
  getHdProjectsApi,
  getSolutionsApi,
  getAnnouncementsApi,
  getDashboardStatsApi,
  getAllHdOptionsApi,
} from '../api/helpdesk/helpdesk.api';

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

/**
 * Fetch a paginated, filtered list of tickets.
 * @param {Object} params - Query parameters (page, pageSize, status, priority, …)
 */
export const fetchTickets = createAsyncThunk(
  'helpdesk/fetchTickets',
  async (params, { rejectWithValue }) => {
    try {
      const res = await getTicketsApi(params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load tickets');
    }
  },
);

/**
 * Fetch a single ticket by its ID.
 * @param {string} id - Ticket ID
 */
export const fetchTicketById = createAsyncThunk(
  'helpdesk/fetchTicketById',
  async (id, { rejectWithValue }) => {
    try {
      const res = await getTicketByIdApi(id);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load ticket');
    }
  },
);

/**
 * Create a new helpdesk ticket.
 * @param {Object} data - Ticket payload
 */
export const createTicket = createAsyncThunk(
  'helpdesk/createTicket',
  async (data, { rejectWithValue }) => {
    try {
      const res = await createTicketApi(data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to create ticket');
    }
  },
);

/**
 * Update an existing ticket.
 * @param {Object} payload
 * @param {string} payload.id   - Ticket ID
 * @param {Object} payload.data - Fields to update
 */
export const updateTicket = createAsyncThunk(
  'helpdesk/updateTicket',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await updateTicketApi(id, data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to update ticket');
    }
  },
);

/**
 * Delete a ticket by ID.
 * @param {string} id - Ticket ID
 */
export const deleteTicket = createAsyncThunk(
  'helpdesk/deleteTicket',
  async (id, { rejectWithValue }) => {
    try {
      await deleteTicketApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to delete ticket');
    }
  },
);

/**
 * Bulk-assign tickets to an agent / group.
 * @param {Object} data - { ticketIds, agentId, groupId, … }
 */
export const bulkAssignTickets = createAsyncThunk(
  'helpdesk/bulkAssignTickets',
  async (data, { rejectWithValue }) => {
    try {
      const res = await bulkAssignTicketsApi(data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Bulk assign failed');
    }
  },
);

/**
 * Fetch all helpdesk groups.
 */
export const fetchGroups = createAsyncThunk(
  'helpdesk/fetchGroups',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getGroupsApi();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load groups');
    }
  },
);

/**
 * Fetch projects available in the helpdesk module.
 */
export const fetchHdProjects = createAsyncThunk(
  'helpdesk/fetchHdProjects',
  async (groupId, { rejectWithValue }) => {
    try {
      const res = await getHdProjectsApi(groupId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load projects');
    }
  },
);

/**
 * Fetch knowledge-base solutions.
 * @param {Object} params - Optional search / filter params
 */
export const fetchSolutions = createAsyncThunk(
  'helpdesk/fetchSolutions',
  async (params, { rejectWithValue }) => {
    try {
      const res = await getSolutionsApi(params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load solutions');
    }
  },
);

/**
 * Fetch helpdesk announcements.
 */
export const fetchAnnouncements = createAsyncThunk(
  'helpdesk/fetchAnnouncements',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getAnnouncementsApi();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load announcements');
    }
  },
);

/**
 * Fetch all configurable helpdesk option types in a single request.
 * Returns grouped object: { category: [...], mode: [...], impact: [...], ... }
 * Status and priority are MySQL ENUMs — still returned for display but treated
 * as read-only in settings.
 */
export const fetchHdOptions = createAsyncThunk(
  'helpdesk/fetchHdOptions',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getAllHdOptionsApi();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load helpdesk options');
    }
  },
);

/**
 * Fetch aggregate dashboard stats for the helpdesk module.
 */
export const fetchDashboardStats = createAsyncThunk(
  'helpdesk/fetchDashboardStats',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getDashboardStatsApi();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Failed to load dashboard stats');
    }
  },
);


// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  // Tickets list
  tickets: [],
  ticketsTotal: 0,
  ticketsPage: 1,
  ticketsPageSize: 20,
  ticketsFilters: {
    status: '',
    priority: '',
    category: '',
    groupId: '',
    projectId: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  },
  ticketsLoading: false,
  ticketsError: null,

  // Single ticket detail
  currentTicket: null,
  currentTicketLoading: false,
  currentTicketError: null,

  // Groups
  groups: [],
  groupsLoading: false,

  // Projects
  hdProjects: [],
  hdProjectsLoading: false,

  // Solutions (KB)
  solutions: [],
  solutionsLoading: false,

  // Announcements
  announcements: [],
  announcementsLoading: false,

  // Dashboard stats
  dashboardStats: null,
  dashboardLoading: false,

  // Configurable field options loaded from hd_options table
  // Shape: { category: [], mode: [], impact: [], urgency: [], request_type: [],
  //          level: [], team: [], site: [], status: [], priority: [] }
  hdOptions: {},
  hdOptionsLoading: false,

  // Create / update operation state
  submitting: false,
  submitError: null,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const helpdeskSlice = createSlice({
  name: 'helpdesk',
  initialState,
  reducers: {
    /**
     * Merge one or more filter values into ticketsFilters and reset page to 1.
     * @param {Object} action.payload - Partial filter object
     */
    setTicketsFilter(state, action) {
      state.ticketsFilters = { ...state.ticketsFilters, ...action.payload };
      state.ticketsPage = 1;
    },

    /**
     * Set the current page for the tickets list.
     * @param {number} action.payload - Page number (1-based)
     */
    setTicketsPage(state, action) {
      state.ticketsPage = action.payload;
    },

    /** Clear the single-ticket detail and its error state. */
    clearCurrentTicket(state) {
      state.currentTicket = null;
      state.currentTicketError = null;
    },

    /** Clear the submit error so forms can reset their error display. */
    clearSubmitError(state) {
      state.submitError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ------------------------------------------------------------------
      // fetchTickets
      // ------------------------------------------------------------------
      .addCase(fetchTickets.pending, (state) => {
        state.ticketsLoading = true;
        state.ticketsError = null;
      })
      .addCase(fetchTickets.fulfilled, (state, action) => {
        state.ticketsLoading = false;
        state.tickets = action.payload.tickets || [];
        state.ticketsTotal = action.payload.total ?? 0;
        state.ticketsPage = action.payload.page ?? state.ticketsPage;
        state.ticketsPageSize = action.payload.pageSize ?? state.ticketsPageSize;
      })
      .addCase(fetchTickets.rejected, (state, action) => {
        state.ticketsLoading = false;
        state.ticketsError = action.payload;
      })

      // ------------------------------------------------------------------
      // fetchTicketById
      // ------------------------------------------------------------------
      .addCase(fetchTicketById.pending, (state) => {
        state.currentTicketLoading = true;
        state.currentTicketError = null;
      })
      .addCase(fetchTicketById.fulfilled, (state, action) => {
        state.currentTicketLoading = false;
        state.currentTicket = action.payload;
      })
      .addCase(fetchTicketById.rejected, (state, action) => {
        state.currentTicketLoading = false;
        state.currentTicketError = action.payload;
      })

      // ------------------------------------------------------------------
      // createTicket
      // ------------------------------------------------------------------
      .addCase(createTicket.pending, (state) => {
        state.submitting = true;
        state.submitError = null;
      })
      .addCase(createTicket.fulfilled, (state, action) => {
        state.submitting = false;
        state.currentTicket = action.payload;
      })
      .addCase(createTicket.rejected, (state, action) => {
        state.submitting = false;
        state.submitError = action.payload;
      })

      // ------------------------------------------------------------------
      // updateTicket
      // ------------------------------------------------------------------
      .addCase(updateTicket.pending, (state) => {
        state.submitting = true;
        state.submitError = null;
      })
      .addCase(updateTicket.fulfilled, (state, action) => {
        state.submitting = false;
        // Refresh the current ticket if it is the one that was updated
        const updId = action.payload?._id ?? action.payload?.id;
        const curId = state.currentTicket?._id ?? state.currentTicket?.id;
        if (state.currentTicket && updId && updId === curId) {
          state.currentTicket = action.payload;
        }
        // Also patch the entry in the list if it is already loaded
        const idx = state.tickets.findIndex((t) => (t._id ?? t.id) === updId);
        if (idx !== -1) {
          state.tickets[idx] = action.payload;
        }
      })
      .addCase(updateTicket.rejected, (state, action) => {
        state.submitting = false;
        state.submitError = action.payload;
      })

      // ------------------------------------------------------------------
      // deleteTicket
      // ------------------------------------------------------------------
      .addCase(deleteTicket.pending, (state) => {
        state.submitting = true;
        state.submitError = null;
      })
      .addCase(deleteTicket.fulfilled, (state, action) => {
        state.submitting = false;
        state.tickets = state.tickets.filter(
          (t) => (t._id ?? t.id) !== action.payload
        );
        state.ticketsTotal = Math.max(0, state.ticketsTotal - 1);
        const curId = state.currentTicket?._id ?? state.currentTicket?.id;
        if (state.currentTicket && curId === action.payload) {
          state.currentTicket = null;
        }
      })
      .addCase(deleteTicket.rejected, (state, action) => {
        state.submitting = false;
        state.submitError = action.payload;
      })

      // ------------------------------------------------------------------
      // bulkAssignTickets
      // ------------------------------------------------------------------
      .addCase(bulkAssignTickets.pending, (state) => {
        state.submitting = true;
        state.submitError = null;
      })
      .addCase(bulkAssignTickets.fulfilled, (state) => {
        state.submitting = false;
      })
      .addCase(bulkAssignTickets.rejected, (state, action) => {
        state.submitting = false;
        state.submitError = action.payload;
      })

      // ------------------------------------------------------------------
      // fetchGroups
      // ------------------------------------------------------------------
      .addCase(fetchGroups.pending, (state) => {
        state.groupsLoading = true;
      })
      .addCase(fetchGroups.fulfilled, (state, action) => {
        state.groupsLoading = false;
        state.groups = action.payload || [];
      })
      .addCase(fetchGroups.rejected, (state) => {
        state.groupsLoading = false;
      })

      // ------------------------------------------------------------------
      // fetchHdProjects
      // ------------------------------------------------------------------
      .addCase(fetchHdProjects.pending, (state) => {
        state.hdProjectsLoading = true;
      })
      .addCase(fetchHdProjects.fulfilled, (state, action) => {
        state.hdProjectsLoading = false;
        state.hdProjects = action.payload || [];
      })
      .addCase(fetchHdProjects.rejected, (state) => {
        state.hdProjectsLoading = false;
      })

      // ------------------------------------------------------------------
      // fetchSolutions
      // ------------------------------------------------------------------
      .addCase(fetchSolutions.pending, (state) => {
        state.solutionsLoading = true;
      })
      .addCase(fetchSolutions.fulfilled, (state, action) => {
        state.solutionsLoading = false;
        state.solutions = action.payload || [];
      })
      .addCase(fetchSolutions.rejected, (state) => {
        state.solutionsLoading = false;
      })

      // ------------------------------------------------------------------
      // fetchAnnouncements
      // ------------------------------------------------------------------
      .addCase(fetchAnnouncements.pending, (state) => {
        state.announcementsLoading = true;
      })
      .addCase(fetchAnnouncements.fulfilled, (state, action) => {
        state.announcementsLoading = false;
        state.announcements = action.payload || [];
      })
      .addCase(fetchAnnouncements.rejected, (state) => {
        state.announcementsLoading = false;
      })

      // ------------------------------------------------------------------
      // fetchDashboardStats
      // ------------------------------------------------------------------
      .addCase(fetchDashboardStats.pending, (state) => {
        state.dashboardLoading = true;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardStats = action.payload;
      })
      .addCase(fetchDashboardStats.rejected, (state) => {
        state.dashboardLoading = false;
      })

      // ------------------------------------------------------------------
      // fetchHdOptions
      // ------------------------------------------------------------------
      .addCase(fetchHdOptions.pending, (state) => {
        state.hdOptionsLoading = true;
      })
      .addCase(fetchHdOptions.fulfilled, (state, action) => {
        state.hdOptionsLoading = false;
        state.hdOptions = action.payload || {};
      })
      .addCase(fetchHdOptions.rejected, (state) => {
        state.hdOptionsLoading = false;
      });
  },
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const {
  setTicketsFilter,
  setTicketsPage,
  clearCurrentTicket,
  clearSubmitError,
} = helpdeskSlice.actions;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** @param {Object} state */
export const selectTickets            = (state) => state.helpdesk.tickets;
export const selectTicketsTotal       = (state) => state.helpdesk.ticketsTotal;
export const selectTicketsPage        = (state) => state.helpdesk.ticketsPage;
export const selectTicketsPageSize    = (state) => state.helpdesk.ticketsPageSize;
export const selectTicketsFilters     = (state) => state.helpdesk.ticketsFilters;
export const selectTicketsLoading     = (state) => state.helpdesk.ticketsLoading;
export const selectCurrentTicket      = (state) => state.helpdesk.currentTicket;
export const selectCurrentTicketLoading = (state) => state.helpdesk.currentTicketLoading;
export const selectGroups             = (state) => state.helpdesk.groups;
export const selectHdProjects         = (state) => state.helpdesk.hdProjects;
export const selectSolutions          = (state) => state.helpdesk.solutions;
export const selectAnnouncements      = (state) => state.helpdesk.announcements;
export const selectDashboardStats     = (state) => state.helpdesk.dashboardStats;
export const selectDashboardLoading   = (state) => state.helpdesk.dashboardLoading;
export const selectSubmitting         = (state) => state.helpdesk.submitting;
export const selectHdOptions          = (state) => state.helpdesk.hdOptions;
export const selectHdOptionsLoading   = (state) => state.helpdesk.hdOptionsLoading;

// ---------------------------------------------------------------------------
// Reducer (default export)
// ---------------------------------------------------------------------------

export default helpdeskSlice.reducer;
