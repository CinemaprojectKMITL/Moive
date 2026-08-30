const write = (level, event, details = {}) => {
  const payload = { timestamp: new Date().toISOString(), level, event, ...details }
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  console[method](JSON.stringify(payload))
}

export const logger = {
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details),
}
