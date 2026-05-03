// Google Calendar API helpers — raw fetch, no googleapis dependency

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: string   // ISO datetime
  end: string     // ISO datetime
  colorId?: string
  crmLeadId?: string | null
  crmType?: string
}

export interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  colorId?: string
  extendedProperties?: { private?: { crmLeadId?: string; crmType?: string } }
}

export const EVENT_COLORS: Record<string, { label: string; google: string; hex: string }> = {
  reunion:      { label: 'Reunión',      google: '1',  hex: '#4285f4' },
  llamada:      { label: 'Llamada',      google: '2',  hex: '#33b679' },
  vencimiento:  { label: 'Vencimiento',  google: '11', hex: '#dc2626' },
  recordatorio: { label: 'Recordatorio', google: '5',  hex: '#f6c026' },
  otro:         { label: 'Otro',         google: '8',  hex: '#616161' },
}

function toCalendarEvent(e: GoogleCalendarEvent): CalendarEvent {
  return {
    id: e.id,
    summary: e.summary ?? '(sin título)',
    description: e.description,
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    colorId: e.colorId,
    crmLeadId: e.extendedProperties?.private?.crmLeadId ?? null,
    crmType: e.extendedProperties?.private?.crmType,
  }
}

export async function listEvents(
  accessToken: string,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 403) throw Object.assign(new Error('insufficient_scope'), { status: 403 })
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`)
  const data = await res.json()
  return ((data.items ?? []) as GoogleCalendarEvent[]).map(toCalendarEvent)
}

export async function createEvent(
  accessToken: string,
  event: {
    summary: string
    description?: string
    start: string
    end: string
    crmType?: string
    crmLeadId?: string | null
  },
): Promise<CalendarEvent> {
  const colorId = event.crmType ? (EVENT_COLORS[event.crmType]?.google ?? '8') : '8'
  const body = {
    summary: event.summary,
    description: event.description ?? '',
    start: { dateTime: event.start, timeZone: 'America/Argentina/Buenos_Aires' },
    end: { dateTime: event.end, timeZone: 'America/Argentina/Buenos_Aires' },
    colorId,
    extendedProperties: {
      private: {
        crmType: event.crmType ?? 'otro',
        ...(event.crmLeadId ? { crmLeadId: event.crmLeadId } : {}),
      },
    },
  }
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Calendar create error: ${res.status}`)
  return toCalendarEvent(await res.json())
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status !== 204 && res.status !== 200) throw new Error(`Calendar delete error: ${res.status}`)
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<{ summary: string; description: string; start: string; end: string }>,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {}
  if (patch.summary) body.summary = patch.summary
  if (patch.description !== undefined) body.description = patch.description
  if (patch.start) body.start = { dateTime: patch.start, timeZone: 'America/Argentina/Buenos_Aires' }
  if (patch.end) body.end = { dateTime: patch.end, timeZone: 'America/Argentina/Buenos_Aires' }
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Calendar update error: ${res.status}`)
  return toCalendarEvent(await res.json())
}
