import request from 'supertest'
import { resolveAccessPolicy } from '../../../shared/apiAccessPolicy.js'

// Existing business tests now perform the same authenticated bootstrap as clients.
// Access-gate regression tests use raw supertest explicitly so omissions stay visible.
export function scopedRequest(app) {
  return new Proxy({}, {
    get(_target, method) {
      return (path) => {
        const test = request(app)[method](path)
        let result
        const proxy = new Proxy(test, {
          get(target, name) {
            if (name === 'then') return (resolve, reject) => {
              result ||= (async () => {
                const policy = resolveAccessPolicy(String(method), path, target._data)
                const cookie = target.getHeader('Cookie')
                if (policy && cookie) {
                  const bootstrap = await request(app).post('/api/request-access').set('Cookie', cookie).send({ method: String(method), path, context: { showId: target._data?.showId, consume: target._data?.consume } })
                  if (bootstrap.status !== 200) return bootstrap
                  target.set('X-API-User-ID', bootstrap.body.userId).set('X-API-Request-ID', bootstrap.body.apiRequestId)
                }
                return await target
              })()
              return result.then(resolve, reject)
            }
            const value = target[name]
            if (typeof value !== 'function') return value
            return (...args) => { const returned = value.apply(target, args); return returned === target ? proxy : returned }
          },
        })
        return proxy
      }
    },
  })
}
