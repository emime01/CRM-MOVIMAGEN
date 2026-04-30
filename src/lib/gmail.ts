// Gmail API helpers — raw fetch, no googleapis dependency

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export function buildOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  email: string
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? 'Token exchange failed')

  // Fetch gmail email address
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const info = await infoRes.json()

  return { ...data, email: info.email }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? 'Refresh failed')
  return data
}

export interface GmailMessage {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  bodyText: string
  receivedAt: string
}

export async function fetchRecentMessages(
  accessToken: string,
  maxResults = 20,
  afterDate?: Date
): Promise<GmailMessage[]> {
  let query = 'in:inbox'
  if (afterDate) {
    const ts = Math.floor(afterDate.getTime() / 1000)
    query += ` after:${ts}`
  }

  const listRes = await fetch(
    `${GMAIL_BASE}/messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) })}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const list = await listRes.json()
  if (!listRes.ok || !list.messages?.length) return []

  const messages: GmailMessage[] = []
  for (const { id, threadId } of list.messages.slice(0, maxResults)) {
    const msgRes = await fetch(
      `${GMAIL_BASE}/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const msg = await msgRes.json()
    if (!msgRes.ok) continue

    const headers = msg.payload?.headers ?? []
    const get = (name: string) => headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    const fromRaw = get('From')
    const fromEmail = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1] ?? fromRaw
    const fromName = fromRaw.replace(/<.+>/, '').trim().replace(/^"|"$/g, '')
    const subject = get('Subject')
    const dateStr = get('Date')
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

    const bodyText = extractText(msg.payload)

    messages.push({ id, threadId, from: fromName || fromEmail, fromEmail, subject, bodyText: bodyText.slice(0, 1500), receivedAt })
  }
  return messages
}

export async function searchMessages(accessToken: string, query: string, maxResults = 10): Promise<GmailMessage[]> {
  const listRes = await fetch(
    `${GMAIL_BASE}/messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) })}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const list = await listRes.json()
  if (!listRes.ok || !list.messages?.length) return []

  const messages: GmailMessage[] = []
  for (const { id, threadId } of list.messages.slice(0, maxResults)) {
    const msgRes = await fetch(
      `${GMAIL_BASE}/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const msg = await msgRes.json()
    if (!msgRes.ok) continue

    const headers = msg.payload?.headers ?? []
    const get = (name: string) => headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    const fromRaw = get('From')
    const fromEmail = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1] ?? fromRaw
    const fromName = fromRaw.replace(/<.+>/, '').trim().replace(/^"|"$/g, '')
    const subject = get('Subject')
    const dateStr = get('Date')
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

    const bodyText = extractText(msg.payload)
    messages.push({ id, threadId, from: fromName || fromEmail, fromEmail, subject, bodyText: bodyText.slice(0, 2000), receivedAt })
  }
  return messages
}

function extractText(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return ''
  const p = payload as {
    mimeType?: string
    body?: { data?: string }
    parts?: Record<string, unknown>[]
  }

  if (p.mimeType === 'text/plain' && p.body?.data) {
    return Buffer.from(p.body.data, 'base64').toString('utf-8')
  }
  if (p.mimeType === 'text/html' && p.body?.data) {
    const html = Buffer.from(p.body.data, 'base64').toString('utf-8')
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (p.parts) {
    return p.parts.map(part => extractText(part as Record<string, unknown>)).join('\n')
  }
  return ''
}
