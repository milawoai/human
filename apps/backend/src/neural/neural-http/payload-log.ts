/** Metadata-only log summary. Trigger payloads can contain prompts and user data. */
export function payloadLogSummary(payload: unknown): string {
  const payloadType = payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload;
  const fieldCount = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload).length
    : undefined;
  return `payloadType=${payloadType}${fieldCount === undefined ? '' : `, payloadFields=${fieldCount}`}`;
}
