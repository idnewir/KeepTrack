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

export const categoriesApi = {
  list: (token) => request('/categories', { token }),
  listAll: (token) => request('/categories/all', { token }),
  create: (payload, token) => request('/categories', { method: 'POST', body: payload, token }),
  update: (id, payload, token) =>
    request(`/categories/${id}`, { method: 'PUT', body: payload, token }),
  deactivate: (id, token) => request(`/categories/${id}`, { method: 'DELETE', token }),
  restore: (id, token) => request(`/categories/${id}/restore`, { method: 'POST', token }),
}

// XHR (not fetch) so upload progress is observable via xhr.upload.onprogress.
function requestForm(path, { method = 'POST', formData, token, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${API_BASE}${path}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }

    xhr.onload = () => {
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // no JSON body
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data)
      } else {
        const message = data?.detail || `Request failed (${xhr.status})`
        reject(new ApiError(message, xhr.status, data))
      }
    }

    xhr.onerror = () => reject(new ApiError('Network error', 0, null))
    xhr.send(formData)
  })
}

export const invoicesApi = {
  upload: (files, token, onProgress) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return requestForm('/invoices/upload', { formData, token, onProgress })
  },
  list: (filters = {}, token) => {
    const params = new URLSearchParams()
    if (filters.categoryId) params.set('category_id', filters.categoryId)
    if (filters.dateFrom) params.set('date_from', filters.dateFrom)
    if (filters.dateTo) params.set('date_to', filters.dateTo)
    if (filters.reviewed !== undefined && filters.reviewed !== '') {
      params.set('reviewed', filters.reviewed)
    }
    const qs = params.toString()
    return request(`/invoices${qs ? `?${qs}` : ''}`, { token })
  },
  get: (id, token) => request(`/invoices/${id}`, { token }),
  update: (id, payload, token) => request(`/invoices/${id}`, { method: 'PUT', body: payload, token }),
  confirm: (id, token) => request(`/invoices/${id}/confirm`, { method: 'POST', token }),
  remove: (id, token) => request(`/invoices/${id}`, { method: 'DELETE', token }),
}
