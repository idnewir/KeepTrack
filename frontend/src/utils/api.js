const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function request(path, { method = 'GET', body, token, headers } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
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
  // rememberToken (if present and not locally expired) is sent so the
  // backend can skip MFA when it's still valid — see docs/decisions-log.md.
  login: (payload, rememberToken) =>
    request('/auth/login', {
      method: 'POST',
      body: payload,
      headers: rememberToken ? { 'X-MFA-Remember-Token': rememberToken } : undefined,
    }),
  verifyMfa: (payload) => request('/auth/verify-mfa', { method: 'POST', body: payload }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token }),
  logout: (token, rememberToken) =>
    request('/auth/logout', {
      method: 'POST',
      token,
      headers: rememberToken ? { 'X-MFA-Remember-Token': rememberToken } : undefined,
    }),
  revokeMfaRemember: (token) => request('/auth/mfa-remember', { method: 'DELETE', token }),
  dismissWelcome: (token) => request('/auth/welcome/dismiss', { method: 'POST', token }),
  updateProfile: (payload, token) =>
    request('/auth/me/profile', { method: 'PUT', body: payload, token }),
  changePassword: (payload, token) =>
    request('/auth/me/password', { method: 'PUT', body: payload, token }),
  pendingUsers: (token) => request('/auth/pending-users', { token }),
  approveUser: (id, role, token) =>
    request(`/auth/approve-user/${id}`, { method: 'POST', body: { role }, token }),
  rejectUser: (id, token) => request(`/auth/reject-user/${id}`, { method: 'DELETE', token }),
  listUsers: (params = {}, token) => {
    const query = new URLSearchParams()
    if (params.approved !== undefined) query.set('approved', params.approved)
    if (params.page) query.set('page', params.page)
    if (params.perPage !== undefined) query.set('per_page', params.perPage)
    const qs = query.toString()
    return request(`/auth/users${qs ? `?${qs}` : ''}`, { token })
  },
  exportUsersCsv: (params = {}, token) => {
    const query = new URLSearchParams()
    if (params.approved !== undefined) query.set('approved', params.approved)
    const qs = query.toString()
    return requestBlob(`/auth/users/export/csv${qs ? `?${qs}` : ''}`, { token })
  },
  updateUserRole: (id, role, token) =>
    request(`/auth/users/${id}/role`, { method: 'PUT', body: { role }, token }),
  deactivateUser: (id, token) => request(`/auth/users/${id}/deactivate`, { method: 'PUT', token }),
  reactivateUser: (id, token) => request(`/auth/users/${id}/reactivate`, { method: 'PUT', token }),
  resetUserPassword: (id, token) =>
    request(`/auth/users/${id}/reset-password`, { method: 'POST', token }),
  forcePasswordChange: (payload, token) =>
    request('/auth/me/force-password-change', { method: 'PUT', body: payload, token }),
  setupAppStartDate: (appStartDate, financialYearStartMonth) =>
    request('/auth/setup/app-start-date', {
      method: 'PUT',
      body: { app_start_date: appStartDate, financial_year_start_month: financialYearStartMonth },
    }),
  setupAiConfig: (payload) => request('/auth/setup/ai-config', { method: 'PUT', body: payload }),
}

export const profileApi = {
  uploadAvatar: (file, token, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm('/profile/avatar', { formData, token, onProgress })
  },
  removeAvatar: (token) => request('/profile/avatar', { method: 'DELETE', token }),
  // Fetched as a Blob (not a plain <img src>) since the endpoint requires
  // an Authorization header — same pattern as invoicesApi.getPreview.
  getAvatarBlob: (userId, token) => requestBlob(`/profile/avatar/${userId}`, { token }),
  // Both fetch the image server-side (see docs/decisions-log.md for why —
  // a browser-side fetch of an external avatar host runs into CSP
  // connect-src restrictions) rather than the frontend loading it directly.
  fetchGravatar: (email, token) =>
    request('/profile/avatar/gravatar', { method: 'POST', body: { email }, token }),
  refreshGravatar: (token) =>
    request('/profile/avatar/gravatar/refresh', { method: 'POST', token }),
  uploadSignature: (file, token, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm('/profile/signature', { formData, token, onProgress })
  },
  removeSignature: (token) => request('/profile/signature', { method: 'DELETE', token }),
  getSignatureBlob: (userId, token) => requestBlob(`/profile/signature/${userId}`, { token }),
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

export const notificationsApi = {
  list: (params = {}, token) => {
    const query = new URLSearchParams()
    if (params.read) query.set('read', params.read)
    if (params.dismissed !== undefined) query.set('dismissed', params.dismissed)
    const qs = query.toString()
    return request(`/notifications${qs ? `?${qs}` : ''}`, { token })
  },
  count: (token) => request('/notifications/count', { token }),
  markRead: (id, token) => request(`/notifications/${id}/read`, { method: 'PUT', token }),
  dismiss: (id, token) => request(`/notifications/${id}/dismiss`, { method: 'PUT', token }),
  markAllRead: (token) => request('/notifications/read-all', { method: 'PUT', token }),
  dismissAll: (token) => request('/notifications/dismiss-all', { method: 'PUT', token }),
}

export const settingsApi = {
  list: (token) => request('/settings', { token }),
  update: (key, value, token) =>
    request(`/settings/${key}`, { method: 'PUT', body: { value }, token }),
  clear: (key, token) => request(`/settings/${key}`, { method: 'DELETE', token }),
}

export const modulesApi = {
  list: (token) => request('/modules', { token }),
  update: (moduleKey, enabled, token) =>
    request(`/modules/${moduleKey}`, { method: 'PUT', body: { enabled }, token }),
  rename: (moduleKey, label, token) =>
    request(`/modules/${moduleKey}/label`, { method: 'PUT', body: { label }, token }),
}

export const systemApi = {
  reset: (payload, token) => request('/system/reset', { method: 'POST', body: payload, token }),
}

export const aiApi = {
  status: (token) => request('/ai/status', { token }),
  getConfig: (token) => request('/ai/config', { token }),
  updateConfig: (payload, token) => request('/ai/config', { method: 'PUT', body: payload, token }),
  test: (token) => request('/ai/test', { method: 'POST', token }),
  models: (endpointUrl, token) => {
    const qs = endpointUrl ? `?endpoint_url=${encodeURIComponent(endpointUrl)}` : ''
    return request(`/ai/models${qs}`, { token })
  },
}

function auditLogQuery(filters = {}) {
  const params = new URLSearchParams()
  if (filters.userId) params.set('user_id', filters.userId)
  if (filters.actionType) params.set('action_type', filters.actionType)
  if (filters.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters.dateTo) params.set('date_to', filters.dateTo)
  return params
}

function errorLogQuery(filters = {}) {
  const params = new URLSearchParams()
  if (filters.severity) params.set('severity', filters.severity)
  if (filters.source) params.set('source', filters.source)
  if (filters.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters.dateTo) params.set('date_to', filters.dateTo)
  if (filters.resolved) params.set('resolved', filters.resolved)
  return params
}

export const logsApi = {
  auditList: (filters = {}, token) => {
    const params = auditLogQuery(filters)
    if (filters.page) params.set('page', filters.page)
    if (filters.perPage !== undefined) params.set('per_page', filters.perPage)
    const qs = params.toString()
    const path = filters.archive ? '/logs/audit/archive' : '/logs/audit'
    return request(`${path}${qs ? `?${qs}` : ''}`, { token })
  },
  auditExportCsv: (filters = {}, token) => {
    const params = auditLogQuery(filters)
    if (filters.archive) params.set('include_archive', 'true')
    const qs = params.toString()
    return requestBlob(`/logs/audit/export/csv${qs ? `?${qs}` : ''}`, { token })
  },
  archiveNow: (token) => request('/logs/audit/archive', { method: 'POST', token }),
  errorsList: (filters = {}, token) => {
    const params = errorLogQuery(filters)
    if (filters.page) params.set('page', filters.page)
    if (filters.perPage !== undefined) params.set('per_page', filters.perPage)
    const qs = params.toString()
    return request(`/logs/errors${qs ? `?${qs}` : ''}`, { token })
  },
  errorsExportCsv: (filters = {}, token) => {
    const qs = errorLogQuery(filters).toString()
    return requestBlob(`/logs/errors/export/csv${qs ? `?${qs}` : ''}`, { token })
  },
  status: (token) => request('/logs/status', { token }),
  resolveError: (id, resolvedNote, token) =>
    request(`/logs/errors/${id}/resolve`, {
      method: 'PUT',
      body: { resolved_note: resolvedNote || null },
      token,
    }),
  unresolveError: (id, token) => request(`/logs/errors/${id}/unresolve`, { method: 'PUT', token }),
  clearAllErrors: (confirmationPhrase, token) =>
    request('/logs/errors/clear-all', {
      method: 'DELETE',
      body: { confirmation_phrase: confirmationPhrase },
      token,
    }),
  clearSelectedErrors: (ids, token) =>
    request('/logs/errors/clear-selected', { method: 'DELETE', body: { ids }, token }),
}

export const terminologyApi = {
  get: (token) => request('/settings/terminology', { token }),
  update: (payload, token) => request('/settings/terminology', { method: 'PUT', body: payload, token }),
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

function contributionsQuery(filters = {}) {
  const params = new URLSearchParams()
  if (filters.financialYearId) params.set('financial_year_id', filters.financialYearId)
  if (filters.month) params.set('month', filters.month)
  return params
}

export const contributionsApi = {
  list: (filters = {}, token) => {
    const params = contributionsQuery(filters)
    if (filters.page) params.set('page', filters.page)
    if (filters.perPage !== undefined) params.set('per_page', filters.perPage)
    const qs = params.toString()
    return request(`/contributions${qs ? `?${qs}` : ''}`, { token })
  },
  exportCsv: (filters = {}, token) => {
    const qs = contributionsQuery(filters).toString()
    return requestBlob(`/contributions/export/csv${qs ? `?${qs}` : ''}`, { token })
  },
  exportPdf: (filters = {}, token) => {
    const qs = contributionsQuery(filters).toString()
    return requestBlob(`/contributions/export/pdf${qs ? `?${qs}` : ''}`, { token })
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
  financialYears: (token) => request('/projects/financial-years', { token }),
  get: (id, token) => request(`/projects/${id}`, { token }),
  create: (payload, token) => request('/projects', { method: 'POST', body: payload, token }),
  update: (id, payload, token) => request(`/projects/${id}`, { method: 'PUT', body: payload, token }),
  deactivate: (id, token) => request(`/projects/${id}`, { method: 'DELETE', token }),
  complete: (id, token) => request(`/projects/${id}/complete`, { method: 'POST', token }),
}

export const reconciliationApi = {
  list: (filters = {}, token) => {
    const params = new URLSearchParams()
    if (filters.financialYearId) params.set('financial_year_id', filters.financialYearId)
    if (filters.isStale !== undefined && filters.isStale !== null) params.set('is_stale', filters.isStale)
    if (filters.page) params.set('page', filters.page)
    if (filters.perPage !== undefined) params.set('per_page', filters.perPage)
    const qs = params.toString()
    return request(`/reconciliation${qs ? `?${qs}` : ''}`, { token })
  },
  getMonth: (year, month, token) => request(`/reconciliation/${year}/${month}`, { token }),
  create: (payload, token) => request('/reconciliation', { method: 'POST', body: payload, token }),
  update: (id, payload, token) => request(`/reconciliation/${id}`, { method: 'PUT', body: payload, token }),
  exportCsv: (financialYearId, token) => {
    const qs = financialYearId ? `?financial_year_id=${financialYearId}` : ''
    return requestBlob(`/reconciliation/export/csv${qs}`, { token })
  },
  exportPdf: (financialYearId, token) => {
    const qs = financialYearId ? `?financial_year_id=${financialYearId}` : ''
    return requestBlob(`/reconciliation/export/pdf${qs}`, { token })
  },
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

// Same as requestBlob but POST — used by storageApi.createBackup, which
// both performs the backup (a POST, since it's a state-changing action) and
// streams the resulting zip back as the download in one round trip. Also
// reads the server-set filename off Content-Disposition, since it carries
// the real timestamped backup filename rather than one the frontend would
// otherwise have to guess.
async function requestBlobPost(path, { token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
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
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const blob = await res.blob()
  return { blob, filename: match ? match[1] : 'backup.zip' }
}

// Saves a Blob (an export download, or a report PDF) to the user's device
// via a throwaway, immediately-revoked object URL.
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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

function invoicesQuery(filters = {}) {
  const params = new URLSearchParams()
  if (filters.categoryId) params.set('category_id', filters.categoryId)
  if (filters.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters.dateTo) params.set('date_to', filters.dateTo)
  if (filters.reviewed !== undefined && filters.reviewed !== '') {
    params.set('reviewed', filters.reviewed)
  }
  if (filters.signed) params.set('signed', filters.signed)
  if (filters.project) params.set('project', filters.project)
  if (filters.historical !== undefined && filters.historical !== '') {
    params.set('historical', filters.historical)
  }
  if (filters.importBatch) params.set('import_batch', filters.importBatch)
  return params
}

export const invoicesApi = {
  upload: (files, token, onProgress) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return requestForm('/invoices/upload', { formData, token, onProgress })
  },
  list: (filters = {}, token) => {
    const params = invoicesQuery(filters)
    if (filters.page) params.set('page', filters.page)
    if (filters.perPage !== undefined) params.set('per_page', filters.perPage)
    const qs = params.toString()
    return request(`/invoices${qs ? `?${qs}` : ''}`, { token })
  },
  exportCsv: (filters = {}, token) => {
    const qs = invoicesQuery(filters).toString()
    return requestBlob(`/invoices/export/csv${qs ? `?${qs}` : ''}`, { token })
  },
  exportPdf: (filters = {}, token) => {
    const qs = invoicesQuery(filters).toString()
    return requestBlob(`/invoices/export/pdf${qs ? `?${qs}` : ''}`, { token })
  },
  get: (id, token) => request(`/invoices/${id}`, { token }),
  update: (id, payload, token) => request(`/invoices/${id}`, { method: 'PUT', body: payload, token }),
  confirm: (id, token, projectId) =>
    request(`/invoices/${id}/confirm`, {
      method: 'POST',
      body: projectId !== undefined ? { project_id: projectId } : undefined,
      token,
    }),
  unlinkProject: (id, token) => request(`/invoices/${id}/unlink-project`, { method: 'POST', token }),
  remove: (id, token) => request(`/invoices/${id}`, { method: 'DELETE', token }),
  sign: (id, payload, token) => request(`/invoices/${id}/sign`, { method: 'POST', body: payload, token }),
  downloadSignedPdf: (id, token) => requestBlob(`/invoices/${id}/signed-pdf`, { token }),
  getOriginalPdf: (id, token) => requestBlob(`/invoices/${id}/original-pdf`, { token }),
  getPreview: (id, token) => requestBlob(`/invoices/${id}/preview`, { token }),
}

export const importsApi = {
  previewCsv: (file, token) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm('/imports/csv/preview', { formData, token })
  },
  uploadCsv: (file, columnMap, token, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    if (columnMap) formData.append('column_map', JSON.stringify(columnMap))
    return requestForm('/imports/csv', { formData, token, onProgress })
  },
  uploadPdfs: (files, token, onProgress) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return requestForm('/imports/pdf', { formData, token, onProgress })
  },
  list: (token) => request('/imports', { token }),
  get: (batchId, token) => request(`/imports/${batchId}`, { token }),
  deleteBatch: (batchId, token, dryRun = false) =>
    request(`/imports/${batchId}${dryRun ? '?dry_run=true' : ''}`, { method: 'DELETE', token }),
}

export const searchApi = {
  search: ({ q, type, page, perPage } = {}, token) => {
    const params = new URLSearchParams()
    params.set('q', q)
    if (type) params.set('type', type)
    if (page) params.set('page', page)
    if (perPage) params.set('per_page', perPage)
    return request(`/search?${params.toString()}`, { token })
  },
}

export const storageApi = {
  status: (token) => request('/storage/status', { token }),
  changePath: (payload, token) => request('/storage/path', { method: 'PUT', body: payload, token }),
  listBackups: (token) => request('/storage/backup', { token }),
  createBackup: (token) => requestBlobPost('/storage/backup', { token }),
  downloadBackup: (filename, token) =>
    requestBlob(`/storage/backup/${encodeURIComponent(filename)}/download`, { token }),
  deleteBackup: (filename, token) =>
    request(`/storage/backup/${encodeURIComponent(filename)}`, { method: 'DELETE', token }),
  setSchedule: (payload, token) =>
    request('/storage/backup/schedule', { method: 'POST', body: payload, token }),
  runScheduledBackup: (token) => request('/storage/backup/run-scheduled', { method: 'POST', token }),
  previewRestore: (file, token) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm('/storage/restore/preview', { formData, token })
  },
  restore: (file, superadminPassword, token) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('superadmin_password', superadminPassword)
    return requestForm('/storage/restore', { formData, token })
  },
}

export const reportsApi = {
  list: (params = {}, token) => {
    const query = new URLSearchParams()
    if (params.page) query.set('page', params.page)
    if (params.perPage !== undefined) query.set('per_page', params.perPage)
    const qs = query.toString()
    return request(`/reports${qs ? `?${qs}` : ''}`, { token })
  },
  get: (id, token) => request(`/reports/${id}`, { token }),
  generate: (payload, token) => request('/reports/generate', { method: 'POST', body: payload, token }),
  remove: (id, token) => request(`/reports/${id}`, { method: 'DELETE', token }),
  downloadPdf: (id, token) => requestBlob(`/reports/${id}/download`, { token }),
  exportCsv: (token) => requestBlob('/reports/export/csv', { token }),
}
