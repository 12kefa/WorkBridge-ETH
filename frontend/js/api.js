// WorkBridge ETH — Frontend API Connector
// Talks to the real Express/PostgreSQL backend. This is the single source
// of truth for auth state (JWT access/refresh tokens + the current user
// object). index.html's inline script reads that state via
// window.getCurrentUser() / window.getAuthToken() — it does not keep its
// own copy in localStorage.

const API_BASE =
  (typeof window !== 'undefined' && window.WB_API_BASE) ||
  'http://localhost:5000/api';

let authToken =
  (typeof localStorage !== 'undefined' && localStorage.getItem('wb_token')) ||
  null;

let refreshToken =
  (typeof localStorage !== 'undefined' && localStorage.getItem('wb_refresh')) ||
  null;

let currentUser = null;

const setTokens = ({ accessToken, refreshToken: newRefresh }) => {
  if (accessToken) {
    authToken = accessToken;
    localStorage.setItem('wb_token', authToken);
  }
  if (newRefresh) {
    refreshToken = newRefresh;
    localStorage.setItem('wb_refresh', refreshToken);
  }
};

const clearTokens = () => {
  authToken = null;
  refreshToken = null;
  localStorage.removeItem('wb_token');
  localStorage.removeItem('wb_refresh');
};

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await fetch(`${API_BASE}/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  setTokens(data.data);
  return data.data.accessToken;
};

async function apiRequest(endpoint, options = {}, _isRetry = false) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
    ...(options.headers || {})
  };
  const config = { ...options, headers };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  // Auto-refresh on 401 once
  if (response.status === 401 && refreshToken && !_isRetry) {
    try {
      await refreshAccessToken();
      return apiRequest(endpoint, options, true);
    } catch {
      clearTokens();
      currentUser = null;
    }
  }

  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

// ===== AUTH =====
async function apiRegister(userData) {
  const data = await apiRequest('/auth/register', { method: 'POST', body: userData });
  if (data.data) {
    setTokens({ accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
    currentUser = data.data.user;
  }
  return data;
}

async function apiLogin(credentials) {
  const data = await apiRequest('/auth/login', { method: 'POST', body: credentials });
  if (data.data) {
    setTokens({ accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
    currentUser = data.data.user;
  }
  return data;
}

async function apiGetMe() {
  const data = await apiRequest('/auth/me');
  currentUser = data.data;
  return data;
}

async function apiUpdateProfile(updates) {
  const data = await apiRequest('/auth/me', { method: 'PATCH', body: updates });
  if (data.data) currentUser = { ...currentUser, ...data.data };
  return data;
}

async function apiUploadPhoto(file) {
  // multipart/form-data — must NOT set Content-Type ourselves (the browser
  // sets the multipart boundary), so this bypasses apiRequest()'s default
  // JSON header instead of fighting it.
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`${API_BASE}/users/me/photo`, {
    method: 'POST',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  if (data.data && currentUser) currentUser.profile_photo = data.data.profile_photo;
  return data;
}

async function apiForgotPassword(email) {
  return await apiRequest('/auth/forgot-password', { method: 'POST', body: { email } });
}

async function apiResetPassword(token, newPassword) {
  return await apiRequest('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
}

async function apiLogout() {
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  clearTokens();
  currentUser = null;
}

async function apiDeactivateAccount() {
  const data = await apiRequest('/auth/me', { method: 'DELETE' });
  clearTokens();
  currentUser = null;
  return data;
}

// ===== JOBS =====
async function apiGetJobs(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return await apiRequest(`/jobs${qs ? '?' + qs : ''}`);
}
async function apiGetJob(id) { return await apiRequest(`/jobs/${id}`); }
async function apiCreateJob(jobData) { return await apiRequest('/jobs', { method: 'POST', body: jobData }); }
async function apiApplyToJob(jobId, application) {
  return await apiRequest(`/jobs/${jobId}/apply`, { method: 'POST', body: application });
}
async function apiGetMyApplications() { return await apiRequest('/jobs/my-applications'); }

// ===== SERVICES =====
async function apiGetServices(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return await apiRequest(`/services${qs ? '?' + qs : ''}`);
}
async function apiGetService(id) { return await apiRequest(`/services/${id}`); }
async function apiCreateService(payload) { return await apiRequest('/services', { method: 'POST', body: payload }); }
async function apiOrderService(id, requirements) {
  return await apiRequest(`/services/${id}/order`, { method: 'POST', body: { requirements } });
}

// ===== DATING =====
async function apiGetDatingProfile() { return await apiRequest('/dating/profile'); }
async function apiCreateDatingProfile(payload) { return await apiRequest('/dating/profile', { method: 'POST', body: payload }); }
async function apiUpdateDatingProfile(payload) { return await apiRequest('/dating/profile', { method: 'PATCH', body: payload }); }
async function apiBrowseDating(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return await apiRequest(`/dating/browse${qs ? '?' + qs : ''}`);
}
async function apiLikeDating(userId) { return await apiRequest(`/dating/like/${userId}`, { method: 'POST' }); }
async function apiGetMatches() { return await apiRequest('/dating/matches'); }
async function apiGetLikes() { return await apiRequest('/dating/likes'); }

// ===== MESSAGES =====
async function apiGetConversations() { return await apiRequest('/messages/conversations'); }
async function apiGetMessagesWith(userId, page = 1) {
  return await apiRequest(`/messages/with/${userId}?page=${page}`);
}
async function apiSendMessage(payload) {
  return await apiRequest('/messages', { method: 'POST', body: payload });
}
async function apiMarkRead(senderId) {
  return await apiRequest('/messages/read', { method: 'POST', body: { sender_id: senderId } });
}

// ===== USERS =====
async function apiBrowseUsers(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return await apiRequest(`/users${qs ? '?' + qs : ''}`);
}
async function apiGetUser(id) { return await apiRequest(`/users/${id}`); }

// ===== ADMIN =====
async function apiGetAdminStats() { return await apiRequest('/admin/stats'); }
async function apiGetAllUsers(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return await apiRequest(`/admin/users${qs ? '?' + qs : ''}`);
}
async function apiVerifyUser(userId) { return await apiRequest(`/admin/users/${userId}/verify`, { method: 'PUT' }); }
async function apiDeactivateUser(userId) { return await apiRequest(`/admin/users/${userId}/deactivate`, { method: 'PUT' }); }
async function apiActivateUser(userId) { return await apiRequest(`/admin/users/${userId}/activate`, { method: 'PUT' }); }

// ===== INIT =====
async function initApp() {
  if (authToken) {
    try {
      await apiGetMe();
    } catch (err) {
      console.warn('Session expired:', err.message);
      clearTokens();
      currentUser = null;
    }
  }
}

// Make everything available to the inline-script HTML
if (typeof window !== 'undefined') {
  window.wbApi = {
    apiRequest, apiRegister, apiLogin, apiLogout, apiDeactivateAccount, apiGetMe, apiUpdateProfile, apiUploadPhoto,
    apiForgotPassword, apiResetPassword,
    apiGetJobs, apiGetJob, apiCreateJob, apiApplyToJob, apiGetMyApplications,
    apiGetServices, apiGetService, apiCreateService, apiOrderService,
    apiGetDatingProfile, apiCreateDatingProfile, apiUpdateDatingProfile,
    apiBrowseDating, apiLikeDating, apiGetMatches, apiGetLikes,
    apiGetConversations, apiGetMessagesWith, apiSendMessage, apiMarkRead,
    apiBrowseUsers, apiGetUser,
    apiGetAdminStats, apiGetAllUsers, apiVerifyUser, apiDeactivateUser, apiActivateUser,
    initApp
  };
  window.getAuthToken = () => authToken;
  window.getCurrentUser = () => currentUser;
  // Auto-init on script load. Exposed as a promise (rather than fired and
  // forgotten) so index.html's inline script — which loads and runs BEFORE
  // this deferred script finishes, see the comment near its own init call —
  // can `await` session restore instead of reading currentUser too early.
  window.wbApiReady = initApp();
}
