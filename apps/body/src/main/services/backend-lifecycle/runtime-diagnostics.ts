const safeSummaries: Array<[string, string]> = [
  ['No authorized Job workspace/executor is configured',
    'Job host is not ready: workspace or read-only executor did not register.'],
  ['Job workspace could not be resolved; read-only executor was not registered',
    'Job worker was not registered because its workspace could not be resolved.'],
  ['Readonly Job workspace unavailable; Job submission disabled',
    'Job worker registration failed while initializing its workspace policy.'],
]

/** Map allowlisted internal warnings to fixed text; never forward raw backend output. */
export function safeRuntimeDiagnostic(line: string): string | undefined {
  const plain = line.replace(/\u001b\[[0-9;]*m/g, '')
  return safeSummaries.find(([needle]) => plain.includes(needle))?.[1]
}
