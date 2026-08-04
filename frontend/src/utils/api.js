const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    // no JSON body (e.g. empty response)
  }

  if (!res.ok) {
    const message = data?.detail || `Request failed (${res.status})`
    throw new ApiError(message, res.status, data)
  }

  return data
}

export const authApi = {
  setupStatus: () => request('/auth/setup-status'),
  setup: (payload) => request('/auth/setup', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  verifyMfa: (payload) => request('/auth/verify-mfa', { method: 'POST', body: payload }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token }),
  pendingUsers: (token) => request('/auth/pending-users', { token }),
  approveUser: (id, role, token) =>
    request(`/auth/approve-user/${id}`, { method: 'POST', body: { role }, token }),
}
