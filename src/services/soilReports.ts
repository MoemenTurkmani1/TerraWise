/** Private-to-this-browser report storage. Files are never uploaded by this adapter. */
export const MAX_SOIL_REPORT_BYTES = 5 * 1024 * 1024
export const SOIL_REPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

/** Browser-profile storage is shared, so it must never be used in an account
 * workspace. While identity/configuration is unresolved, fail closed. */
export function canUseLocalReports(options: { authenticated: boolean; loading: boolean; configurationInvalid: boolean }): boolean {
  return !options.authenticated && !options.loading && !options.configurationInvalid
}

export function validateSoilReport(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(SOIL_REPORT_TYPES as readonly string[]).includes(file.type)) return 'Choose a PDF, JPEG, PNG, or WebP file.'
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > MAX_SOIL_REPORT_BYTES) return 'The report must be 5 MB or smaller.'
  return null
}

/** Check the format signature in addition to the browser-reported MIME type. */
export async function verifySoilReport(file: File): Promise<string | null> {
  const problem = validateSoilReport(file)
  if (problem) return problem
  if (!file.name.trim() || file.name.length > 500) return 'The report name must contain 1 to 500 characters.'
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value)
  const valid = file.type === 'application/pdf' ? starts(0x25, 0x50, 0x44, 0x46, 0x2d)
    : file.type === 'image/jpeg' ? starts(0xff, 0xd8, 0xff)
      : file.type === 'image/png' ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        : starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return valid ? null : 'The file content does not match its reported format. Choose a valid report.'
}

function openReports(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local report storage is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('terrawise.soil-reports.v1', 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('reports')) request.result.createObjectStore('reports') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open local report storage.'))
    request.onblocked = () => reject(new Error('Report storage is blocked by another browser tab.'))
  })
}

async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openReports()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', mode)
    const request = action(tx.objectStore('reports'))
    let value: T
    request.onsuccess = () => { value = request.result }
    tx.oncomplete = () => { db.close(); resolve(value) }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not access the local soil report. Check browser storage and try again.')) }
  })
}

export async function saveSoilReport(file: File): Promise<{ id: string; filename: string; mimeType: string; size: number }> {
  const error = await verifySoilReport(file)
  if (error) throw new Error(error)
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  await operation('readwrite', store => store.put(file, id))
  return { id, filename: file.name, mimeType: file.type, size: file.size }
}

export async function loadSoilReport(id: string): Promise<Blob | undefined> {
  const value: unknown = await operation('readonly', store => store.get(id))
  if (value !== undefined && !(value instanceof Blob)) throw new Error('The saved report is not a valid file.')
  return value as Blob | undefined
}

/** Only call after the user explicitly requests permanent report deletion. */
export async function deleteSoilReport(id: string): Promise<void> {
  await operation('readwrite', store => store.delete(id))
}
