import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  basisHashOf,
  computeAffected,
  deriveSpreads,
  evaluateBleed,
  faceBleedRequired,
  nowStamp,
  planShards,
  spineBleedRequired,
  type AffectedSet,
  type BindingType,
  type BleedConclusion,
  type ConfirmOutcome,
  type PendingDiff,
  type ReleaseSnapshot,
  type Shard,
  type SpreadConclusion,
} from '../domain/release'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type Proof = { id: string; round: number; date: string; sample: string; deltaE: number; feedback: string; correction: string; owner: string; decision: '待决定' | '通过' | '退回' }
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断'; updatedAt: string; resumable: boolean; basisHash: string; idempotencyKey: string }

export const sheetSpec = {
  width: 720,
  height: 1020,
  bleed: 3,
  safe: 5,
  gutter: 6,
  grain: '纵向',
}

const seedPages: Page[] = [
  { pageNo: 1, name: '封面', width: 210, height: 297, bleed: 3, content: '潮汐来信 / 节目册' },
  { pageNo: 2, name: '版权页', width: 210, height: 297, bleed: 2, content: '版权与演职人员' },
  { pageNo: 3, name: '序言', width: 210, height: 297, bleed: 3, content: '导演手记' },
  { pageNo: 4, name: '剧照跨页左', width: 210, height: 297, bleed: 3, content: '第一幕剧照' },
  { pageNo: 5, name: '剧照跨页右', width: 210, height: 297, bleed: 3, content: '第一幕剧照延伸' },
  { pageNo: 6, name: '曲目表', width: 210, height: 297, bleed: 3, content: '曲目与时长' },
  { pageNo: 7, name: '创作团队', width: 210, height: 297, bleed: 1, content: '主创与制作团队' },
  { pageNo: 8, name: '封底', width: 210, height: 297, bleed: 3, content: '巡演信息' },
]

const seedPositions: Position[] = [
  { id: 'P-01', pageNo: 8, x: 34, y: 44, rotation: 0, front: true },
  { id: 'P-02', pageNo: 1, x: 372, y: 44, rotation: 180, front: true },
  { id: 'P-03', pageNo: 6, x: 34, y: 548, rotation: 180, front: true },
  { id: 'P-04', pageNo: 3, x: 372, y: 548, rotation: 0, front: true },
  { id: 'P-05', pageNo: 2, x: 34, y: 44, rotation: 0, front: false },
  { id: 'P-06', pageNo: 7, x: 372, y: 44, rotation: 180, front: false },
  { id: 'P-07', pageNo: 4, x: 34, y: 548, rotation: 0, front: false },
  { id: 'P-08', pageNo: 5, x: 372, y: 548, rotation: 180, front: false },
]

const seedProofs: Proof[] = [
  { id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理', decision: '退回' },
  { id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。', owner: '林青 / 拼版', decision: '待决定' },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 75, status: '已中断', updatedAt: '09-25 16:42', resumable: true, basisHash: '', idempotencyKey: 'idem-exp-0925-01' },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false, basisHash: '', idempotencyKey: 'idem-exp-0925-02' },
]

const SHARD_SIZE = 2

export const useImpositionStore = defineStore('imposition', () => {
  const saved = localStorage.getItem('print-imposition-v2')
  const restored = saved ? JSON.parse(saved) : null

  const pages = ref<Page[]>(restored?.pages ?? structuredClone(seedPages))
  const positions = ref<Position[]>(restored?.positions ?? structuredClone(seedPositions))
  const proofs = ref<Proof[]>(restored?.proofs ?? structuredClone(seedProofs))
  const tasks = ref<ExportTask[]>(restored?.tasks ?? structuredClone(seedTasks))
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(restored?.revision ?? 'R6')
  const locked = ref(restored?.locked ?? false)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  // 装订工艺与页序（放行来源的一部分）
  const binding = ref<BindingType>(restored?.binding ?? '骑马订')
  const pageOrder = ref<number[]>(restored?.pageOrder ?? seedPages.map((p) => p.pageNo))

  // 放行来源：工艺依据（旧稿为 null → 待复核）、已确认指纹
  const processBasis = ref<string | null>(restored?.processBasis ?? null)
  const confirmedBasisHash = ref<string | null>(restored?.confirmedBasisHash ?? null)
  const confirmedBy = ref<string | null>(restored?.confirmedBy ?? null)
  const confirmedAt = ref<string | null>(restored?.confirmedAt ?? null)

  // 结论与分片
  const spreadConclusions = ref<SpreadConclusion[]>(restored?.spreadConclusions ?? [])
  const bleedConclusions = ref<BleedConclusion[]>(restored?.bleedConclusions ?? [])
  const shards = ref<Shard[]>(restored?.shards ?? [])
  const diffs = ref<PendingDiff[]>(restored?.diffs ?? [])

  // 演示开关：强制下一次写盘失败（用于观察断点续做）
  const failNextWrite = ref(false)

  const latestProofRound = computed(() => proofs.value.reduce((max, p) => Math.max(max, p.round), 0))

  const basisSnapshot = computed<ReleaseSnapshot>(() => ({
    binding: binding.value,
    revision: revision.value,
    proofRound: latestProofRound.value,
    pageOrder: pageOrder.value,
  }))

  /** 放行来源指纹：工艺 / 版本 / 轮次 / 页序共用。 */
  const basisHash = computed(() => basisHashOf(basisSnapshot.value))

  /** 书脊侧出血要求（随工艺变化）。 */
  const requiredBleed = computed(() => spineBleedRequired(binding.value))

  /** 旧稿缺工艺依据，或已确认指纹与当前来源不一致 → 待复核。 */
  const releaseStatus = computed<'待复核' | '已放行'>(() => {
    if (!processBasis.value) return '待复核'
    if (confirmedBasisHash.value !== basisHash.value) return '待复核'
    return '已放行'
  })

  const canRelease = computed(() => ({
    ok: processBasis.value !== null,
    reason: processBasis.value ? '' : '缺工艺依据，先待复核',
  }))

  /** 预检：出血按书脊侧工艺要求判定，其余规则不变。 */
  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const placedPages = positions.value.map((position) => position.pageNo)
    pages.value.forEach((page) => {
      if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      if (page.bleed < requiredBleed.value) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于${binding.value}书脊侧要求 ${requiredBleed.value}mm（切口侧 ${faceBleedRequired()}mm）。` })
    })
    for (let index = 0; index < positions.value.length; index += 1) {
      for (let next = index + 1; next < positions.value.length; next += 1) {
        const a = positions.value[index]
        const b = positions.value[next]
        if (a.front === b.front && Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 430) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    const frontOrder = positions.value.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
    if (frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: `${binding.value}正版页序需要复核`, detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
    return issues
  })

  watch([pages, positions, proofs, tasks, revision, locked, binding, pageOrder, processBasis, confirmedBasisHash, confirmedBy, confirmedAt, spreadConclusions, bleedConclusions, shards, diffs], () => {
    localStorage.setItem('print-imposition-v2', JSON.stringify({
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      revision: revision.value,
      locked: locked.value,
      binding: binding.value,
      pageOrder: pageOrder.value,
      processBasis: processBasis.value,
      confirmedBasisHash: confirmedBasisHash.value,
      confirmedBy: confirmedBy.value,
      confirmedAt: confirmedAt.value,
      spreadConclusions: spreadConclusions.value,
      bleedConclusions: bleedConclusions.value,
      shards: shards.value,
      diffs: diffs.value,
    }))
  }, { deep: true })

  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: 34, y: 44, rotation: 0, front: side.value === 'front' })
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (proof) Object.assign(proof, patch)
  }

  function createProof() {
    proofs.value.push({ id: `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`, round: proofs.value.length + 1, date: new Date().toISOString().slice(0, 10), sample: `数字样张 v${proofs.value.length + 1}`, deltaE: 0, feedback: '', correction: '', owner: '当前用户', decision: '待决定' })
  }

  function lockBaseline() {
    locked.value = true
    revision.value = `R${Number(revision.value.slice(1)) + 1}`
  }

  function unlock() {
    locked.value = false
  }

  // —— 放行来源：工艺依据 ——

  /** 补齐工艺依据（旧稿缺工艺依据 → 待复核）。 */
  function establishProcessBasis() {
    processBasis.value = `工艺依据:${binding.value}`
  }

  /** 切换装订工艺：工艺依据随之确立，只让受牵连结论与分片失效重算。 */
  function setBinding(next: BindingType) {
    if (next === binding.value) return
    const prev = basisSnapshot.value
    binding.value = next
    if (!processBasis.value) processBasis.value = `工艺依据:${next}`
    const nextSnap = basisSnapshot.value
    recomputeRelease(prev, nextSnap)
  }

  /** 调整页序：只让受牵连跨页、出血结论与未完成分片失效重算。 */
  function reorderPages(nextOrder: number[]) {
    if (JSON.stringify(nextOrder) === JSON.stringify(pageOrder.value)) return
    const prev = basisSnapshot.value
    pageOrder.value = nextOrder
    const nextSnap = basisSnapshot.value
    recomputeRelease(prev, nextSnap)
  }

  /** 复位为旧稿（缺工艺依据 → 待复核），用于演示。 */
  function markLegacyDraft() {
    processBasis.value = null
    confirmedBasisHash.value = null
    confirmedBy.value = null
    confirmedAt.value = null
  }

  // —— 牵连失效与重算 ——

  function currentSpreads() {
    return deriveSpreads(pageOrder.value)
  }

  function buildSpreadConclusions(affected: AffectedSet | null): SpreadConclusion[] {
    const affectedKeys = new Set(affected?.affectedSpreadKeys ?? [])
    return currentSpreads().map((sp) => {
      const isAffected = affectedKeys.has(sp.key)
      return {
        key: sp.key,
        pages: sp.pages,
        valid: true,
        note: isAffected ? '受牵连，已按新工艺/页序重算' : '照旧有效',
      }
    })
  }

  function buildBleedConclusions(affected: AffectedSet | null): BleedConclusion[] {
    const affectedPages = new Set(affected?.affectedPages ?? [])
    return pages.value.map((page) => {
      const isAffected = affectedPages.has(page.pageNo)
      const { sufficient, required } = evaluateBleed(page.bleed, binding.value)
      return {
        pageNo: page.pageNo,
        valid: true,
        sufficient,
        required,
        actual: page.bleed,
        note: isAffected ? '受牵连，已重算书脊侧出血结论' : '照旧有效',
      }
    })
  }

  /** 按当前页序与工艺重建分片规划（不触碰已存在分片的断点）。 */
  function ensureShards() {
    const ranges = planShards(pages.value.length, SHARD_SIZE)
    const byTask = new Map<string, Shard[]>()
    shards.value.forEach((s) => {
      const list = byTask.get(s.taskId) ?? []
      list.push(s)
      byTask.set(s.taskId, list)
    })
    for (const task of tasks.value) {
      const list = byTask.get(task.id) ?? []
      ranges.forEach((range, index) => {
        const existing = list.find((s) => s.range[0] === range[0] && s.range[1] === range[1])
        if (!existing) {
          shards.value.push({
            id: `${task.id}-S${index + 1}`,
            taskId: task.id,
            range,
            basisHash: basisHash.value,
            status: 'incomplete',
            attempts: 0,
            lastCompleteAt: null,
            idempotencyKey: `${task.id}-S${index + 1}`,
          })
        }
      })
    }
  }

  /** 种子分片：与种子任务进度吻合（EXP-0925-01 完成 3/4，EXP-0925-02 全部完成）。 */
  function seedShards() {
    const ranges = planShards(pages.value.length, SHARD_SIZE)
    for (const task of tasks.value) {
      ranges.forEach((range, index) => {
        const complete = task.status === '已完成' || (task.id === 'EXP-0925-01' && index < 3)
        shards.value.push({
          id: `${task.id}-S${index + 1}`,
          taskId: task.id,
          range,
          basisHash: basisHash.value,
          status: complete ? 'complete' : 'incomplete',
          attempts: complete ? 1 : 0,
          lastCompleteAt: complete ? task.updatedAt : null,
          idempotencyKey: `${task.id}-S${index + 1}`,
        })
      })
    }
  }

  /** 工艺/页序调整后：重算受牵连结论，失效未完成分片，无关页面照旧。 */
  function recomputeRelease(prev: ReleaseSnapshot, next: ReleaseSnapshot) {
    const spreads = currentSpreads()
    const pageBleed: Record<number, number> = {}
    pages.value.forEach((p) => (pageBleed[p.pageNo] = p.bleed))
    const affected = computeAffected(prev, next, spreads, pageBleed)

    spreadConclusions.value = buildSpreadConclusions(affected)
    bleedConclusions.value = buildBleedConclusions(affected)

    // 未完成分片失效；已完成分片若覆盖受牵连页则标记 stale，否则保留断点（照旧）
    const affectedPages = new Set(affected.affectedPages)
    shards.value.forEach((shard) => {
      if (shard.status === 'incomplete') {
        shard.status = 'incomplete'
        shard.basisHash = basisHash.value
      } else if (shard.status === 'complete') {
        const intersects = shard.range.some((p) => affectedPages.has(p))
        shard.status = intersects ? 'stale' : 'complete'
        if (intersects) shard.basisHash = basisHash.value
      }
    })

    lastAffected.value = affected
  }

  const lastAffected = ref<AffectedSet | null>(null)

  // —— 并发确认：先到者占用，后到者留差异 ——

  function confirmRelease(actor: string, expectedHash: string): { outcome: ConfirmOutcome; reason?: string; diff?: PendingDiff } {
    if (!processBasis.value) {
      return { outcome: 'rejected', reason: '缺工艺依据，先待复核' }
    }
    const alreadyOccupied = confirmedBasisHash.value === basisHash.value
    const hashMismatch = expectedHash !== basisHash.value
    if (alreadyOccupied || hashMismatch) {
      const diff: PendingDiff = {
        id: `DIF-${String(diffs.value.length + 1).padStart(2, '0')}`,
        actor,
        basisHash: expectedHash,
        payload: `确认放行 ${basisHash.value}`,
        receivedAt: nowStamp(),
        status: '待裁决',
      }
      diffs.value.push(diff)
      return { outcome: 'conflict', reason: alreadyOccupied ? '已被先到确认占用' : '放行来源指纹不匹配', diff }
    }
    confirmedBasisHash.value = basisHash.value
    confirmedBy.value = actor
    confirmedAt.value = nowStamp()
    return { outcome: 'occupied' }
  }

  function acknowledgeDiff(id: string, status: '已采纳' | '已驳回') {
    const diff = diffs.value.find((d) => d.id === id)
    if (diff) diff.status = status
  }

  // —— 分片断点续做与幂等重试 ——

  function taskShards(taskId: string) {
    return shards.value.filter((s) => s.taskId === taskId)
  }

  function refreshTaskProgress(taskId: string) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return
    const list = taskShards(taskId)
    if (!list.length) return
    const done = list.filter((s) => s.status === 'complete').length
    task.progress = Math.round((done / list.length) * 100)
    task.basisHash = basisHash.value
    if (task.progress === 100) {
      task.status = '已完成'
      task.resumable = false
    } else if (list.some((s) => s.status === 'incomplete' || s.status === 'stale')) {
      task.status = '已中断'
      task.resumable = true
    }
  }

  /** 写一个分片：失败则回退到最后完整分片（断点），不追加任务。 */
  function writeShard(shard: Shard): boolean {
    shard.attempts += 1
    if (failNextWrite.value) {
      failNextWrite.value = false
      // 写盘失败：回退到最后完整分片；此前无完整分片则保持未完成
      if (shard.lastCompleteAt) {
        shard.status = 'complete'
      } else {
        shard.status = 'incomplete'
      }
      return false
    }
    shard.status = 'complete'
    shard.basisHash = basisHash.value
    shard.lastCompleteAt = nowStamp()
    return true
  }

  /** 从最后完整分片恢复续做：只重算未完成/失效分片，已完成分片照旧复用。 */
  function resumeTask(id: string): ExportTask | null {
    const task = tasks.value.find((t) => t.id === id)
    if (!task || !task.resumable) return task ?? null
    task.status = '生成中'
    task.updatedAt = '刚刚'
    const list = taskShards(id)
    for (const shard of list) {
      if (shard.status === 'complete') continue // 断点复用，不重算
      writeShard(shard)
    }
    refreshTaskProgress(id)
    return task
  }

  /** 幂等重试：同一 idempotencyKey 不重复追加任务。 */
  function retryTask(id: string, idempotencyKey: string): ExportTask {
    const existing = tasks.value.find((t) => t.idempotencyKey === idempotencyKey)
    if (existing) return existing
    return resumeTask(id) ?? tasks.value.find((t) => t.id === id)!
  }

  /** 新建交付任务：幂等键去重，不重复追加。 */
  function createTask(name: string, idempotencyKey: string): ExportTask {
    const existing = tasks.value.find((t) => t.idempotencyKey === idempotencyKey)
    if (existing) return existing
    const task: ExportTask = {
      id: `EXP-${Date.now().toString().slice(-6)}`,
      name,
      progress: 0,
      status: '排队中',
      updatedAt: '刚刚',
      resumable: true,
      basisHash: basisHash.value,
      idempotencyKey,
    }
    tasks.value.push(task)
    ensureShards()
    return task
  }

  // 初始化结论与分片（旧稿无工艺依据 → 待复核）
  if (!spreadConclusions.value.length) spreadConclusions.value = buildSpreadConclusions(null)
  if (!bleedConclusions.value.length) bleedConclusions.value = buildBleedConclusions(null)
  if (!shards.value.length) seedShards()
  tasks.value.forEach((t) => { if (!t.basisHash) t.basisHash = basisHash.value })

  return {
    pages, positions, proofs, tasks, side, zoom, revision, locked, selectedPosition, selectedProof,
    binding, pageOrder, processBasis, confirmedBasisHash, confirmedBy, confirmedAt,
    spreadConclusions, bleedConclusions, shards, diffs, failNextWrite, lastAffected,
    latestProofRound, basisSnapshot, basisHash, requiredBleed, releaseStatus, canRelease,
    validations,
    updatePosition, addPosition, updateProof, createProof, lockBaseline, unlock,
    establishProcessBasis, setBinding, reorderPages, markLegacyDraft,
    confirmRelease, acknowledgeDiff,
    taskShards, resumeTask, retryTask, createTask,
  }
})
