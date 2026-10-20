export async function accountApi(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CineMax-Request': '1' },
      ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
    })
  } catch { throw new Error('Could not reach CineMax. Check your connection and try again.') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return data
}
