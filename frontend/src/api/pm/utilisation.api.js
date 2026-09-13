import api from '../axios';

/**
 * GET /pm/utilisation?from=YYYY-MM&to=YYYY-MM&userIds=a,b,c
 * userIds optional (array or comma string). Max range 12 months.
 */
export const getUtilisationApi = ({ from, to, userIds } = {}) => {
  const params = { from, to };
  if (userIds && userIds.length) {
    params.userIds = Array.isArray(userIds) ? userIds.join(',') : userIds;
  }
  return api.get('/pm/utilisation', { params });
};

/** GET /pm/users/:userId/utilisation?month=YYYY-MM */
export const getUserUtilisationApi = (userId, month) =>
  api.get(`/pm/users/${userId}/utilisation`, { params: { month } });
