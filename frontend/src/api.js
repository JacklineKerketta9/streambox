// Tiny fetch wrapper: keeps the access token in memory (never localStorage),
// and transparently refreshes it via the httpOnly refresh cookie on a 401.
let accessToken = null;
let inflightRefresh = null;

export const setToken = (t) => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Shared promise so concurrent callers never rotate the same refresh token twice.
export function refreshSession() {
  if (!inflightRefresh) {
    inflightRefresh = fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, 'Session expired');
        const data = await res.json();
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => {
        inflightRefresh = null;
      });
  }
  return inflightRefresh;
}

function send(path, { method = 'GET', body } = {}) {
  return fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function api(path, opts = {}) {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
      res = await send(path, opts);
    } catch {
      /* fall through with the original 401 */
    }
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Request failed', data && data.details);
  return data;
}

// Turns the backend's validation details into one readable line.
export function errorMessage(err) {
  const first = err.details && Object.values(err.details).flat()[0];
  return first ? `${err.message}: ${first}` : err.message;
}
