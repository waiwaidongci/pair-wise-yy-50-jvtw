import axios, { type AxiosAdapter } from 'axios'
import { useImpositionStore } from '../stores/imposition'

/**
 * 导出 REST 适配层。
 * 任务、分片、确认都读写 store 中同一份放行来源（basisHash），
 * 工艺/页序调整后不会把旧折手、版位、色差依据混进新导出包。
 */
const adapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 160))
  const store = useImpositionStore()
  const url = config.url ?? ''
  const method = (config.method ?? 'get').toLowerCase()
  const body = config.data ? JSON.parse(String(config.data)) : {}

  if (url === '/api/print/export-tasks' && method === 'get') {
    return { data: structuredClone(store.tasks), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (url === '/api/print/export-tasks' && method === 'post') {
    const task = store.createTask(body.name ?? '印刷交付包 · PDF/X-4', body.idempotencyKey ?? `idem-${Date.now()}`)
    return { data: structuredClone(task), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (url.match(/^\/api\/print\/export-tasks\/[^/]+\/resume$/) && method === 'post') {
    const id = url.split('/').at(-2)!
    const task = store.resumeTask(id)
    if (!task) return { data: null, status: 404, statusText: 'Not Found', headers: {}, config }
    return { data: structuredClone(task), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (url.match(/^\/api\/print\/export-tasks\/[^/]+\/retry$/) && method === 'post') {
    const id = url.split('/').at(-2)!
    const task = store.retryTask(id, body.idempotencyKey ?? `idem-${id}`)
    return { data: structuredClone(task), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (url === '/api/print/release/confirm' && method === 'post') {
    const result = store.confirmRelease(body.actor ?? '生产主管', body.basisHash ?? '')
    return { data: structuredClone(result), status: 200, statusText: 'OK', headers: {}, config }
  }

  return { data: null, status: 404, statusText: 'Not Found', headers: {}, config }
}

const client = axios.create({ adapter })

export const exportApi = {
  list: () => client.get('/api/print/export-tasks'),
  create: (name: string, idempotencyKey: string) => client.post('/api/print/export-tasks', { name, idempotencyKey }),
  resume: (id: string) => client.post(`/api/print/export-tasks/${id}/resume`),
  retry: (id: string, idempotencyKey: string) => client.post(`/api/print/export-tasks/${id}/retry`, { idempotencyKey }),
  confirm: (actor: string, basisHash: string) => client.post('/api/print/release/confirm', { actor, basisHash }),
}
