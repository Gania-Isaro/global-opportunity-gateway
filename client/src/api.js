// Small wrapper around fetch for the GOG REST API (JSON over HTTPS).
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, url, body) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'GOG' },
  };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, options);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data.error || 'Something went wrong.', data.fields);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

export const fileUrl = (url) => `/api${url}`;
