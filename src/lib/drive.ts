// Google Drive API helpers — raw fetch, drive.file scope only

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  webViewLink: string
  mimeType: string
}

async function driveGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive API ${res.status}: ${err}`)
  }
  return res.json()
}

async function drivePost(token: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive API ${res.status}: ${err}`)
  }
  return res.json()
}

// Find folder by name (under parent), create if missing. Returns folder ID.
export async function getOrCreateFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const parentQ = parentId ? ` and '${parentId}' in parents` : ''
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false${parentQ}`
  const list = await driveGet(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)
  if (list.files?.length > 0) return list.files[0].id

  const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) body.parents = [parentId]
  const folder = await drivePost(token, '/files?fields=id', body)
  return folder.id
}

// Multipart upload: metadata + file bytes in one request
export async function uploadFileToDrive(
  token: string,
  data: Uint8Array,
  name: string,
  mimeType: string,
  parentId?: string
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name }
  if (parentId) metadata.parents = [parentId]

  const boundary = `movimagen_${Date.now()}`
  const enc = new TextEncoder()

  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  )
  const tail = enc.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(head.length + data.length + tail.length)
  body.set(head, 0)
  body.set(data, head.length)
  body.set(tail, head.length + data.length)

  const res = await fetch(
    `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,mimeType`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload ${res.status}: ${err}`)
  }

  return res.json()
}
