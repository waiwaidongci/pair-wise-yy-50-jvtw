import axios, { type AxiosAdapter } from 'axios'
import { ledger, snapshot, type ExportTask } from '../domain/ledger'

/**
 * 模拟 REST 适配器直接读写全局放行台账：
 * 交付任务、分片、续做进度与 Pinia 共用一份来源，不再维护第二份内存副本。
 */
const adapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 160))

  if (config.url === '/api/print/export-tasks' && config.method === 'get') {
    const releaseId = (config.params as { releaseId?: string } | undefined)?.releaseId ?? ledger.activeRelease().id
    const tasks = ledger.tasksOf(releaseId)
    return { data: snapshot(tasks), status: 200, statusText: 'OK', headers: {}, config }
  }

  if (config.url === '/api/print/export-tasks' && config.method === 'post') {
    const body = (JSON.parse(config.data ?? '{}') ?? {}) as { releaseId?: string; idempotencyKey?: string }
    if (!body.releaseId) return { data: null, status: 400, statusText: 'Bad Request', headers: {}, config }
    // 同一 release + 幂等键重复提交（含网络重试）只返回已有任务，不追加。
    const task = ledger.ensureDeliveryTask(body.releaseId)
    return { data: snapshot(task), status: 200, statusText: 'OK', headers: {}, config }
  }

  const resumeMatch = config.url?.match(/^\/api\/print\/export-tasks\/[^/]+\/resume$/)
  if (resumeMatch && config.method === 'post') {
    const id = config.url!.split('/').at(-2)!
    const body = (JSON.parse(config.data ?? '{}') ?? {}) as { token?: string }
    // 幂等键缺失时按任务生成稳定键，保证前端重试也不会重复推进。
    const token = body.token ?? `retry-${id}`
    const result = ledger.resumeTask(id, token)
    if (!result.ok) return { data: { reason: result.reason }, status: 409, statusText: 'Conflict', headers: {}, config }
    return { data: { task: result.task, reason: result.reason, duplicate: Boolean(result.duplicate) }, status: 200, statusText: 'OK', headers: {}, config }
  }

  return { data: null, status: 404, statusText: 'Not Found', headers: {}, config }
}

const client = axios.create({ adapter })

export const exportApi = {
  list: (releaseId?: string) =>
    client.get<ExportTask[]>('/api/print/export-tasks', { params: releaseId ? { releaseId } : {} }),
  create: (releaseId: string, idempotencyKey?: string) =>
    client.post<ExportTask>('/api/print/export-tasks', JSON.stringify({ releaseId, idempotencyKey })),
  resume: (id: string, token: string) =>
    client.post<{ task: ExportTask; reason: string; duplicate?: boolean }>(
      `/api/print/export-tasks/${id}/resume`,
      JSON.stringify({ token }),
    ),
}
