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

export const dashboardApi = {
  summary: (token) => request('/dashboard/summary', { token }),
  notifications: (token) => request('/dashboard/notifications', { token }),
}

export const settingsApi = {
  list: (token) => request('/settings', { token }),
  update: (key, value, token) =>
    request(`/settings/${key}`, { method: 'PUT', body: { value }, token }),
}

export const financialYearsApi = {
  current: (token) => request('/financial-years/current', { token }),
  setOpeningBalance: (id, openingBalance, token) =>
    request(`/financial-years/${id}/opening-balance`, {
      method: 'PUT',
      body: { opening_balance: openingBalance },
      token,
    }),
}

export const contributionsApi = {
  list: (filters = {}, token) => {
    const params = new URLSearchParams()
    if (filters.financialYearId) params.set('financial_year_id', filters.financialYearId)
    if (filters.month) params.set('month', filters.month)
    const qs = params.toString()
    return request(`/contributions${qs ? `?${qs}` : ''}`, { token })
  },
  monthlySummary: (financialYearId, token) => {
    const qs = financialYearId ? `?financial_year_id=${financialYearId}` : ''
    return request(`/contributions/monthly-summary${qs}`, { token })
  },
  create: (payload, token) => request('/contributions', { method: 'POST', body: payload, token }),
  update: (id, payload, token) => request(`/contributions/${id}`, { method: 'PUT', body: payload, token }),
  remove: (id, token) => request(`/contributions/${id}`, { method: 'DELETE', token }),
}

export const projectsApi = {
  list: (token) => request('/projects', { token }),
  listAll: (token) => request('/projects/all', { token }),
  get: (id, token) => request(`/projects/${id}`, { token }),
  create: (payload, token) => request('/projects', { method: 'POST', body: payload, token }),
  update: (id, payload, token) => request(`/projects/${id}`, { method: 'PUT', body: payload, token }),
  deactivate: (id, token) => request(`/projects/${id}`, { method: 'DELETE', token }),
  complete: (id, token) => request(`/projects/${id}/complete`, { method: 'POST', token }),
}

export const reconciliationApi = {
  list: (financialYearId, token) => {
    const qs = financialYearId ? `?financial_year_id=${financialYearId}` : ''
    return request(`/reconciliation${qs}`, { token })
  },
  getMonth: (year, month, token) => request(`/reconciliation/${year}/${month}`, { token }),
  create: (payload, token) => request('/reconciliation', { method: 'POST', body: payload, token }),
  update: (id, discrepancyNotes, token) =>
    request(`/reconciliation/${id}`, { method: 'PUT', body: { discrepancy_notes: discrepancyNotes }, token }),
}

// Plain fetch returning a Blob, for authenticated file downloads (the browser
// can't attach an Authorization header to a plain <a href> download).
async function requestBlob(path, { token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let data = null
    try {
      data = await res.json()
    } catch {
      // no JSON body
    }
    throw new ApiError(data?.detail || `Request failed (${res.status})`, res.status, data)
  }
  return res.blob()
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
  sign: (id, payload, token) => request(`/invoices/${id}/sign`, { method: 'POST', body: payload, token }),
  downloadSignedPdf: (id, token) => requestBlob(`/invoices/${id}/signed-pdf`, { token }),
  getOriginalPdf: (id, token) => requestBlob(`/invoices/${id}/original-pdf`, { token }),
}

export const reportsApi = {
  list: (token) => request('/reports', { token }),
  get: (id, token) => request(`/reports/${id}`, { token }),
  generate: (payload, token) => request('/reports/generate', { method: 'POST', body: payload, token }),
  remove: (id, token) => request(`/reports/${id}`, { method: 'DELETE', token }),
  downloadPdf: (id, token) => requestBlob(`/reports/${id}/download`, { token }),
}
