/**
 * 放行领域逻辑
 *
 * 装订工艺、拼版版本、打样轮次、交付任务共用同一份放行来源（basisHash）。
 * 工艺或页序调整时，只让受牵连的跨页、出血结论和未完成分片失效重算，无关页面照旧。
 * 写盘失败后从最后完整分片恢复续做，重试不重复追加任务。
 * 旧稿缺工艺依据先待复核。
 */

export type BindingType = '骑马订' | '胶装'
export type ReleaseStatus = '待复核' | '已放行'
export type ShardStatus = 'complete' | 'incomplete' | 'stale'
export type DiffStatus = '待裁决' | '已采纳' | '已驳回'
export type ConfirmOutcome = 'occupied' | 'conflict' | 'rejected'

export type SpreadPair = { key: string; pages: [number, number] }

/** 跨页结论：valid=false 表示受牵连待重算，true 表示照旧有效。 */
export type SpreadConclusion = {
  key: string
  pages: [number, number]
  valid: boolean
  note: string
}

/** 出血结论：书脊侧出血要求随装订工艺变化。 */
export type BleedConclusion = {
  pageNo: number
  valid: boolean
  sufficient: boolean
  required: number
  actual: number
  note: string
}

/** 分片：complete 为断点，incomplete/stale 需重算。 */
export type Shard = {
  id: string
  taskId: string
  range: [number, number]
  basisHash: string
  status: ShardStatus
  attempts: number
  lastCompleteAt: string | null
  idempotencyKey: string
}

/** 后到者留下的差异。 */
export type PendingDiff = {
  id: string
  actor: string
  basisHash: string
  payload: string
  receivedAt: string
  status: DiffStatus
}

export type AffectedSet = {
  bindingChanged: boolean
  orderChanged: boolean
  affectedPages: number[]
  affectedSpreadKeys: string[]
  reasons: string[]
}

export type ReleaseSnapshot = {
  binding: BindingType
  revision: string
  proofRound: number
  pageOrder: number[]
}

/** 放行来源指纹：工艺 / 版本 / 轮次 / 页序任一调整都会改变它。 */
export function basisHashOf(snapshot: ReleaseSnapshot): string {
  const raw = `${snapshot.binding}|${snapshot.revision}|${snapshot.proofRound}|${snapshot.pageOrder.join(',')}`
  let h = 0
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0
  }
  return `BASIS-${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

/** 由页序推导跨页成对：封面跨页 + 内页相邻成对。 */
export function deriveSpreads(pageOrder: number[]): SpreadPair[] {
  const pairs: SpreadPair[] = []
  if (pageOrder.length >= 2) {
    pairs.push({ key: `spread-${pageOrder[0]}-${pageOrder[pageOrder.length - 1]}`, pages: [pageOrder[0], pageOrder[pageOrder.length - 1]] })
  }
  for (let i = 1; i + 1 < pageOrder.length; i += 2) {
    pairs.push({ key: `spread-${pageOrder[i]}-${pageOrder[i + 1]}`, pages: [pageOrder[i], pageOrder[i + 1]] })
  }
  return pairs
}

/** 书脊侧出血要求：骑马订折缝不铣背 2mm 即可；胶装书脊铣背开槽需 3mm。 */
export function spineBleedRequired(binding: BindingType): number {
  return binding === '骑马订' ? 2 : 3
}

/** 切口侧出血要求：统一 3mm。 */
export function faceBleedRequired(): number {
  return 3
}

/** 评估书脊侧出血结论。 */
export function evaluateBleed(actual: number, binding: BindingType): { sufficient: boolean; required: number } {
  const required = spineBleedRequired(binding)
  return { sufficient: actual >= required, required }
}

/**
 * 比对新旧放行来源，得出受牵连集合。
 * 工艺变更：折手决定全部已拼跨页成对关系 → 跨页全部重算；仅书脊侧出血结论可能翻转的页面受牵连。
 * 页序调整：受牵连跨页与出血结论重算，无关页面照旧。
 */
export function computeAffected(
  prev: ReleaseSnapshot,
  next: ReleaseSnapshot,
  spreads: SpreadPair[],
  pageBleed: Record<number, number>,
): AffectedSet {
  const bindingChanged = prev.binding !== next.binding
  const orderChanged = JSON.stringify(prev.pageOrder) !== JSON.stringify(next.pageOrder)
  const affectedPages = new Set<number>()
  const affectedSpreadKeys = new Set<string>()
  const reasons: string[] = []

  if (bindingChanged) {
    reasons.push('装订工艺变更：折手成对关系与书脊侧出血依据需按新工艺重算')
    spreads.forEach((s) => affectedSpreadKeys.add(s.key))
    const prevReq = spineBleedRequired(prev.binding)
    const nextReq = spineBleedRequired(next.binding)
    for (const [pageNoStr, bleed] of Object.entries(pageBleed)) {
      const pageNo = Number(pageNoStr)
      const flips = (bleed >= prevReq) !== (bleed >= nextReq)
      if (flips || bleed < nextReq) affectedPages.add(pageNo)
    }
  }

  if (orderChanged) {
    reasons.push('页序调整：受牵连跨页与出血结论重算，无关页面照旧')
    const prevOrder = prev.pageOrder
    const nextOrder = next.pageOrder
    const reordered = nextOrder.filter((p, i) => prevOrder.indexOf(p) !== i)
    reordered.forEach((p) => affectedPages.add(p))
    spreads.forEach((s) => {
      if (s.pages.some((p) => affectedPages.has(p))) affectedSpreadKeys.add(s.key)
    })
    affectedSpreadKeys.forEach((key) => {
      const sp = spreads.find((s) => s.key === key)
      sp?.pages.forEach((p) => affectedPages.add(p))
    })
  }

  return {
    bindingChanged,
    orderChanged,
    affectedPages: [...affectedPages],
    affectedSpreadKeys: [...affectedSpreadKeys],
    reasons,
  }
}

/** 分片规划：从第 1 页起按 shardSize 页切分。 */
export function planShards(pageCount: number, shardSize: number): [number, number][] {
  const ranges: [number, number][] = []
  for (let start = 1; start <= pageCount; start += shardSize) {
    ranges.push([start, Math.min(start + shardSize - 1, pageCount)])
  }
  return ranges
}

export function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
