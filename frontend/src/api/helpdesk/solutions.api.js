import axios from 'axios';
import api from '../axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch a paginated, filtered list of solution articles.
 * @param {{ search?: string, category?: string, page?: number, pageSize?: number }} params
 */
export const getSolutionsApi = (params) => api.get('/helpdesk/solutions', { params });

/**
 * Fetch a single solution article by its ID.
 * @param {number|string} id
 */
export const getSolutionByIdApi = (id) => api.get(`/helpdesk/solutions/${id}`);

/**
 * Create a new solution article.
 * @param {object} data
 */
export const createSolutionApi = (data) => api.post('/helpdesk/solutions', data);

/**
 * Update an existing solution article.
 * @param {number|string} id
 * @param {object} data
 */
export const updateSolutionApi = (id, data) => api.put(`/helpdesk/solutions/${id}`, data);

/**
 * Delete a solution article.
 * @param {number|string} id
 */
export const deleteSolutionApi = (id) => api.delete(`/helpdesk/solutions/${id}`);

/**
 * Fetch publicly accessible solution articles — no auth required.
 * @param {{ search?: string, category?: string, page?: number, pageSize?: number }} params
 */
export const getPublicSolutionsApi = (params) =>
  axios.get(`${API_URL}/helpdesk/solutions/public`, { params });
