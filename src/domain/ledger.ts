import { reactive, toRaw } from 'vue'

/**
 * 放行台账（单一放行来源）
 *
 * 装订工艺、拼版版本、跨页/出血结论、打样工艺依据、交付分片全部挂在同一份
 * Release 上，任何工艺或页序调整都在这里做依赖比对：只失效受牵连的结论与
 * 未完成分片，其余结论/分片沿用，避免骑马订时代的旧依据混进胶装导出包。
 */

export type Binding = '骑马订' | '胶装'
export type ReleaseStatus = '编辑中' | '待复核' | '已放行' | '已替代'
export type VerdictState = '有效' | '待重算' | '已作废'
export type ProofDecision = '待决定' | '通过' | '退回'
export type ProofBasisState = '依据完整' | '工艺依据缺失待复核' | '工艺依据不符待复核'
export type SliceState = '未开始' | '写入中' | '已完成' | '写盘失败'

export interface Page {
  pageNo: number
  name: string
  width: number
  height: number
  bleed: number
  content: string
}

export interface Position {
  id: string
  pageNo: number
  x: number
  y: number
  rotation: number
  front: boolean
}

export interface Validation {
  id: string
  severity: '错误' | '警告'
  pageNo?: number
  title: string
  detail: string
}

export interface SpreadVerdict {
  id: string
  releaseId: string
  key: string
  label: string
  leftPage: number
  rightPage: number
  foldSig: string
  state: VerdictState
  pass: boolean | null
  reason: string
  trail?: string
}

export interface BleedVerdict {
  id: string
  releaseId: string
  pageNo: number
  edge: string
  required: number
  actual: number
  state: VerdictState
  pass: boolean | null
  reason: string
  trail?: string
}

export interface ExportSlice {
  id: string
  index: number
  pages: number[]
  state: SliceState
  partialPercent?: number
  hash?: string
  note: string
}

export interface ExportTask {
  id: string
  name: string
  kind: 'main' | 'preview'
  releaseId: string
  progress: number
  status: '排队中' | '生成中' | '已完成' | '已中断' | '已冻结'
  updatedAt: string
  resumable: boolean
  note?: string
  slices: ExportSlice[]
  processedTokens: string[]
}

export interface Proof {
  id: string
  round: number
  date: string
  sample: string
  deltaE: number
  feedback: string
  correction: string
  owner: string
  decision: ProofDecision
  /** 打样所依据的装订工艺；旧稿可能为空 */
  bindingBasis: Binding | null
  originReleaseId: string
  reviewedAt?: string
}

export interface Release {
  id: string
  revision: string
  binding: Binding
  createdAt: string
  status: ReleaseStatus
  version: number
  parentId?: string
  confirmedBy?: string
  confirmedAt?: string
}

export interface ConfirmConflict {
  id: string
  releaseId: string
  revision: string
  winnerBy: string
  winnerAt: string
  winnerVersion: number
  loserBy: string
  loserAt: string
  loserBaseVersion: number
  diff: { field: string; winner: string; loser: string }[]
}

export interface LedgerState {
  releases: Release[]
  activeReleaseId: string
  spreads: SpreadVerdict[]
  bleeds: BleedVerdict[]
  proofs: Proof[]
  tasks: ExportTask[]
  conflicts: ConfirmConflict[]
  pages: Page[]
  positions: Position[]
}

export interface FoldPair {
  key: string
  label: string
  left: number
  right: number
  foldSig: string
}

/** 折手方案：按装订工艺给出必须对接的跨页及其折手签名。签名相同的跨页，结论可跨工艺沿用。 */
export function foldPlan(binding: Binding): FoldPair[] {
  if (binding === '骑马订') {
    return [
      { key: '8-1', label: '封面套合跨页', left: 8, right: 1, foldSig: '套合外帖' },
      { key: '2-3', label: '内页跨页', left: 2, right: 3, foldSig: '骑马订折帖' },
      { key: '4-5', label: '剧照跨页', left: 4, right: 5, foldSig: '书心对页' },
      { key: '6-7', label: '内页跨页', left: 6, right: 7, foldSig: '骑马订折帖' },
    ]
  }
  return [
    { key: '2-3', label: '内页跨页', left: 2, right: 3, foldSig: '书心对页' },
    { key: '4-5', label: '剧照跨页', left: 4, right: 5, foldSig: '书心对页' },
    { key: '6-7', label: '内页跨页', left: 6, right: 7, foldSig: '书心对页' },
  ]
}

/** 订口出血要求：骑马订折位统一 3mm；胶装订口铣背/胶粘允许 2mm。 */
export function spineBleedRequired(binding: Binding): number {
  return binding === '骑马订' ? 3 : 2
}

function spineEdge(pageNo: number): string {
  return `${pageNo % 2 === 0 ? '左' : '右'}订口`
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

export const SLICE_PAGES: Record<number, number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
}

export type Ledger = ReturnType<typeof createLedger>

export interface CreateLedgerOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  storageKey?: string
  now?: () => Date
}

export function createLedger(options: CreateLedgerOptions = {}) {
  const storage = options.storage === undefined ? safeStorage() : options.storage
  const storageKey = options.storageKey ?? 'print-release-ledger-v2'
  const clock = options.now ?? (() => new Date())

  const state = reactive<LedgerState>(loadInitial()) as LedgerState

  function stamp() {
    return clock().toISOString().slice(0, 10)
  }

  function stampMinute() {
    const d = clock()
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function commit() {
    if (!storage) return
    try {
      storage.setItem(storageKey, JSON.stringify({
        releases: state.releases,
        activeReleaseId: state.activeReleaseId,
        spreads: state.spreads,
        bleeds: state.bleeds,
        proofs: state.proofs,
        tasks: state.tasks,
        conflicts: state.conflicts,
        pages: state.pages,
        positions: state.positions,
      }))
    } catch {
      /* 存储不可用时只保留内存态 */
    }
  }

  function loadInitial(): LedgerState {
    if (storage) {
      try {
        const raw = storage.getItem(storageKey)
        if (raw) {
          const saved = JSON.parse(raw) as LedgerState
          if (saved?.releases?.length && saved.activeReleaseId) return saved
        }
      } catch {
        /* 旧版本或损坏数据回退种子 */
      }
    }
    return seedState()
  }

  function seedState(): LedgerState {
    const release: Release = {
      id: 'REL-R6',
      revision: 'R6',
      binding: '骑马订',
      createdAt: '2026-09-25',
      status: '待复核',
      version: 1,
    }
    const proofs: Proof[] = [
      {
        id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8,
        feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。',
        correction: '调整 CMYK 曲线，黑色通道减少 4%。',
        owner: '周默 / 色彩管理', decision: '退回',
        bindingBasis: null,
        originReleaseId: 'REL-R5',
      },
      {
        id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9,
        feedback: '整体色差改善，P7 出血仍不足。',
        correction: '重排 P7 版位并增加 2mm 出血。',
        owner: '林青 / 拼版', decision: '待决定',
        bindingBasis: '骑马订',
        originReleaseId: 'REL-R6',
      },
    ]
    const slices: ExportSlice[] = [
      slice(1, '未开始'),
      slice(2, '未开始'),
      slice(3, '未开始'),
      slice(4, '未开始'),
    ]
    slices[0] = { ...slices[0], state: '已完成', hash: 'sha256:9f1a-0102', note: '分片写入完成并通过哈希校验' }
    slices[1] = { ...slices[1], state: '已完成', hash: 'sha256:3c72-0304', note: '分片写入完成并通过哈希校验' }
    slices[2] = { ...slices[2], state: '写盘失败', partialPercent: 22, note: '分片写入 22% 时磁盘不可用，保留失败现场' }

    const tasks: ExportTask[] = [
      {
        id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', kind: 'main', releaseId: 'REL-R6',
        progress: 72, status: '已中断', updatedAt: '09-25 16:42', resumable: true, slices, processedTokens: [],
      },
      {
        id: 'EXP-0925-02', name: '数字样张低分辨率预览', kind: 'preview', releaseId: 'REL-R6',
        progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false,
        slices: [1, 2, 3, 4].map((i) => ({ ...slice(i, '已完成'), hash: `sha256:prev-${i}` })),
        processedTokens: [],
      },
    ]

    const s: LedgerState = {
      releases: [release],
      activeReleaseId: release.id,
      spreads: [],
      bleeds: [],
      proofs,
      tasks,
      conflicts: [],
      pages: structuredClone(seedPages),
      positions: structuredClone(seedPositions),
    }
    for (const pair of foldPlan('骑马订')) {
      s.spreads.push({
        id: `SPD-R6-${pair.key}`,
        releaseId: 'REL-R6',
        key: pair.key,
        label: pair.label,
        leftPage: pair.left,
        rightPage: pair.right,
        foldSig: pair.foldSig,
        state: '有效',
        pass: true,
        reason: `骑马订「${pair.foldSig}」折手位与跨页对接公差已核对合格`,
      })
    }
    for (const page of s.pages) {
      s.bleeds.push(evaluateBleed(release, page, s.pages, undefined))
    }
    return s
  }

  function slice(index: number, state: SliceState): ExportSlice {
    return { id: `S${index}`, index, pages: [...SLICE_PAGES[index]], state, note: state === '未开始' ? '待生成' : '' }
  }

  // ---------- 查询 ----------

  function activeRelease(): Release {
    const found = state.releases.find((item) => item.id === state.activeReleaseId)
    if (!found) throw new Error('active release missing')
    return found
  }

  function releaseById(id: string): Release | undefined {
    return state.releases.find((item) => item.id === id)
  }

  function spreadsOf(releaseId = state.activeReleaseId): SpreadVerdict[] {
    return state.spreads.filter((item) => item.releaseId === releaseId)
  }

  function bleedsOf(releaseId = state.activeReleaseId): BleedVerdict[] {
    return state.bleeds.filter((item) => item.releaseId === releaseId)
  }

  function tasksOf(releaseId = state.activeReleaseId): ExportTask[] {
    return state.tasks.filter((item) => item.releaseId === releaseId)
  }

  function mainTask(releaseId = state.activeReleaseId): ExportTask | undefined {
    return state.tasks.find((item) => item.releaseId === releaseId && item.kind === 'main')
  }

  function proofBasisState(proof: Proof, release: Release = activeRelease()): ProofBasisState {
    if (!proof.bindingBasis) return '工艺依据缺失待复核'
    if (proof.bindingBasis !== release.binding) return '工艺依据不符待复核'
    return '依据完整'
  }

  function pendingProofs(release: Release = activeRelease()): { proof: Proof; basis: ProofBasisState }[] {
    return state.proofs
      .map((proof) => ({ proof, basis: proofBasisState(proof, release) }))
      .filter((item) => item.basis !== '依据完整')
  }

  function staleVerdicts(release: Release = activeRelease()) {
    return {
      spreads: spreadsOf(release.id).filter((item) => item.state === '待重算'),
      bleeds: bleedsOf(release.id).filter((item) => item.state === '待重算'),
    }
  }

  /** 放行前检查：受牵连结论必须重算完成、旧稿工艺依据必须复核、至少一轮通过的打样。 */
  function releaseReadiness(release: Release = activeRelease()) {
    const pending = pendingProofs(release)
    const stale = staleVerdicts(release)
    const approved = state.proofs.some((proof) => proof.decision === '通过' && proofBasisState(proof, release) === '依据完整')
    const blockers: string[] = []
    if (stale.spreads.length) blockers.push(`有 ${stale.spreads.length} 个跨页结论受牵连待重算`)
    if (stale.bleeds.length) blockers.push(`有 ${stale.bleeds.length} 个出血结论受牵连待重算`)
    if (pending.length) blockers.push(`有 ${pending.length} 份打样记录工艺依据待复核`)
    if (!approved) blockers.push('缺少工艺依据完整且决定为通过的打样轮次')
    return { ok: blockers.length === 0, blockers, pending, approved }
  }

  // ---------- 结论评估 ----------

  function evaluateSpread(release: Release, pair: FoldPair, trail?: string): SpreadVerdict {
    const placed = (pageNo: number) => state.positions.some((position) => position.pageNo === pageNo)
    const pass = placed(pair.left) && placed(pair.right)
    return {
      id: `SPD-${release.revision}-${pair.key}`,
      releaseId: release.id,
      key: pair.key,
      label: pair.label,
      leftPage: pair.left,
      rightPage: pair.right,
      foldSig: pair.foldSig,
      state: '有效',
      pass,
      trail,
      reason: `${trail ? `${trail}，` : ''}已按${release.binding}「${pair.foldSig}」重算：两页均已上版，折手位与对接公差合格`,
    }
  }

  function evaluateBleed(release: Release, page: Page, pages: Page[], trail?: string): BleedVerdict {
    const required = spineBleedRequired(release.binding)
    const pass = page.bleed >= required
    return {
      id: `BLD-${release.revision}-P${page.pageNo}`,
      releaseId: release.id,
      pageNo: page.pageNo,
      edge: spineEdge(page.pageNo),
      required,
      actual: page.bleed,
      state: '有效',
      pass,
      trail,
      reason: `${trail ? `${trail}，` : ''}${release.binding}${spineEdge(page.pageNo)}要求 ${required}mm，文件出血 ${page.bleed}mm，${pass ? '结论合格' : '结论不通过'}`,
    }
  }

  function recomputeStale(release: Release = activeRelease()) {
    const plan = foldPlan(release.binding)
    for (const verdict of staleVerdicts(release).spreads) {
      const pair = plan.find((item) => item.key === verdict.key)
      if (!pair) {
        verdict.state = '已作废'
        verdict.pass = null
        verdict.reason = `${release.binding}折手方案不含跨页 ${verdict.key}，${verdict.trail ?? '工艺变化'}后原结论作废`
      } else {
        Object.assign(verdict, evaluateSpread(release, pair, verdict.trail))
      }
    }
    for (const verdict of staleVerdicts(release).bleeds) {
      const page = state.pages.find((item) => item.pageNo === verdict.pageNo)
      if (page) Object.assign(verdict, evaluateBleed(release, page, state.pages, verdict.trail))
    }
    refreshStatus(release)
    commit()
  }

  function refreshStatus(release: Release) {
    if (release.status === '已放行' || release.status === '已替代') return
    release.status = pendingProofs(release).length > 0 ? '待复核' : '编辑中'
  }

  // ---------- 工艺 / 页序调整 ----------

  /** 切换装订工艺：新建放行来源，按折手签名与订口规则比对，仅失效受牵连项。 */
  function changeBinding(target: Binding): Release {
    const current = activeRelease()
    if (current.binding === target) return current

    const number = nextRevisionNumber()
    const revision = `R${number}`
    const release: Release = {
      id: `REL-${revision}`,
      revision,
      binding: target,
      createdAt: stamp(),
      status: '编辑中',
      version: 1,
      parentId: current.id,
    }
    state.releases.forEach((item) => {
      if (item.id === current.id) item.status = '已替代'
    })
    state.releases.push(release)
    state.activeReleaseId = release.id

    const trail = `工艺由${current.binding}改为${target}`
    const oldPlan = foldPlan(current.binding)
    const newPlan = foldPlan(target)
    const oldSpreads = spreadsOf(current.id)

    for (const pair of newPlan) {
      const previous = oldSpreads.find((item) => item.key === pair.key)
      if (previous && previous.state === '有效' && previous.foldSig === pair.foldSig) {
        state.spreads.push({
          id: `SPD-${revision}-${pair.key}`,
          releaseId: release.id,
          key: pair.key,
          label: pair.label,
          leftPage: pair.left,
          rightPage: pair.right,
          foldSig: pair.foldSig,
          state: '有效',
          pass: previous.pass,
          reason: `跨页 ${pair.key} 在两种工艺下同为「${pair.foldSig}」，无关项照旧，沿用 ${current.revision} 核对结论`,
        })
      } else {
        state.spreads.push({
          id: `SPD-${revision}-${pair.key}`,
          releaseId: release.id,
          key: pair.key,
          label: pair.label,
          leftPage: pair.left,
          rightPage: pair.right,
          foldSig: pair.foldSig,
          state: '待重算',
          pass: null,
          trail,
          reason: `跨页 ${pair.key} 折手签名变化（${previous?.foldSig ?? '无'} → ${pair.foldSig}），结论失效待重算`,
        })
      }
    }
    for (const old of oldPlan.filter((pair) => !newPlan.some((next) => next.key === pair.key))) {
      state.spreads.push({
        id: `SPD-${revision}-${old.key}`,
        releaseId: release.id,
        key: old.key,
        label: old.label,
        leftPage: old.left,
        rightPage: old.right,
        foldSig: old.foldSig,
        state: '待重算',
        pass: null,
        trail,
        reason: `跨页 ${old.key} 在${target}下不再套合，原结论待作废`,
      })
    }

    // 订口出血规则随工艺变化：全部订口结论受牵连重算（切口规则未变，不在这里）。
    for (const page of state.pages) {
      state.bleeds.push({
        id: `BLD-${revision}-P${page.pageNo}`,
        releaseId: release.id,
        pageNo: page.pageNo,
        edge: spineEdge(page.pageNo),
        required: spineBleedRequired(target),
        actual: page.bleed,
        state: '待重算',
        pass: null,
        trail,
        reason: `${spineEdge(page.pageNo)}出血规则随工艺调整，结论失效待重算`,
      })
    }

    carryTasksToRelease(release, current, new Set<number>(), trail)
    // 受牵连结论保持「待重算」，由 recomputeStale() 显式重算后才可放行；无关项已直接沿用。
    refreshStatus(release)
    commit()
    return release
  }

  /**
   * 页序调整：交换两个页面槽位上的页面内容。
   * 仅失效包含这两页的跨页、这两页的订口出血结论，以及与它们相交的未完成分片。
   */
  function reorderPages(pageA: number, pageB: number): Release {
    if (pageA === pageB) return activeRelease()
    const a = state.pages.find((page) => page.pageNo === pageA)
    const b = state.pages.find((page) => page.pageNo === pageB)
    if (!a || !b) return activeRelease()

    const release = ensureDraftRelease()
    const trail = `页序调整 P${pageA} ↔ P${pageB}`

    // 页面内容（含出血值）随槽位互换；版位槽位本身不动。
    const fields: (keyof Page)[] = ['name', 'width', 'height', 'bleed', 'content']
    for (const field of fields) {
      const tmp = a[field]
      // @ts-expect-error 交换同类型字段
      a[field] = b[field]
      // @ts-expect-error 交换同类型字段
      b[field] = tmp
    }

    const tainted = new Set<number>([pageA, pageB])

    for (const verdict of spreadsOf(release.id)) {
      if (verdict.state === '已作废') continue
      if (tainted.has(verdict.leftPage) || tainted.has(verdict.rightPage)) {
        verdict.state = '待重算'
        verdict.pass = null
        verdict.trail = trail
        verdict.reason = `跨页 ${verdict.key} 含被调整页，页序变化后失效待重算`
      }
    }
    for (const verdict of bleedsOf(release.id)) {
      if (tainted.has(verdict.pageNo)) {
        verdict.state = '待重算'
        verdict.pass = null
        verdict.trail = trail
        verdict.actual = state.pages.find((page) => page.pageNo === verdict.pageNo)?.bleed ?? verdict.actual
        verdict.reason = `P${verdict.pageNo} 页面内容已更换，订口出血结论失效待重算`
      } else if (verdict.state === '有效') {
        verdict.reason = `${trail} 未牵连该页，无关页面照旧，沿用既有合格结论`
      }
    }

    invalidateSlices(release, tainted, trail)
    refreshStatus(release)
    commit()
    return release
  }

  /** 已放行后再调整，自动开一个同工艺的修订 release，全部结论先沿用。 */
  function ensureDraftRelease(): Release {
    const current = activeRelease()
    if (current.status !== '已放行') return current
    const number = nextRevisionNumber()
    const revision = `R${number}`
    const draft: Release = {
      id: `REL-${revision}`,
      revision,
      binding: current.binding,
      createdAt: stamp(),
      status: '编辑中',
      version: 1,
      parentId: current.id,
    }
    current.status = '已替代'
    state.releases.push(draft)
    state.activeReleaseId = draft.id

    for (const old of spreadsOf(current.id)) {
      const pair = foldPlan(draft.binding).find((item) => item.key === old.key)
      if (!pair || old.state !== '有效') continue
      state.spreads.push({
        id: `SPD-${revision}-${old.key}`,
        releaseId: draft.id,
        key: old.key,
        label: pair.label,
        leftPage: pair.left,
        rightPage: pair.right,
        foldSig: pair.foldSig,
        state: '有效',
        pass: old.pass,
        reason: `同工艺修订，跨页 ${old.key} 结论沿用 ${current.revision}`,
      })
    }
    for (const old of bleedsOf(current.id)) {
      const page = state.pages.find((item) => item.pageNo === old.pageNo)
      if (!page || old.state !== '有效') continue
      state.bleeds.push({
        id: `BLD-${revision}-P${old.pageNo}`,
        releaseId: draft.id,
        pageNo: old.pageNo,
        edge: old.edge,
        required: old.required,
        actual: page.bleed,
        state: '有效',
        pass: old.pass,
        reason: `同工艺修订，P${old.pageNo} 出血结论沿用 ${current.revision}`,
      })
    }
    carryTasksToRelease(draft, current, new Set<number>(), '锁定后开修订版')
    refreshStatus(draft)
    commit()
    return draft
  }

  function nextRevisionNumber(): number {
    return state.releases.reduce((max, item) => Math.max(max, Number(item.revision.slice(1))), 6) + 1
  }

  // ---------- 分片与交付任务 ----------

  function carryTasksToRelease(next: Release, previous: Release, taintedPages: Set<number>, trail: string) {
    for (const task of tasksOf(previous.id)) {
      if (task.status !== '已完成') {
        task.status = '已冻结'
        task.resumable = false
        task.updatedAt = stampMinute()
        task.note = `放行来源 ${next.revision} 已启用，本任务绑定的 ${previous.revision}（${previous.binding}）被替代，任务冻结`
      }
    }
    const previousMain = mainTask(previous.id)
    if (previousMain) {
      const slices: ExportSlice[] = previousMain.slices.map((old) => {
        const hit = old.pages.some((pageNo) => taintedPages.has(pageNo))
        if (old.state === '已完成' && !hit) {
          return {
            ...snapshot(old),
            id: old.id,
            note: `页面文件未变且哈希校验通过（${old.hash}），${trail} 后无关分片照旧沿用`,
          }
        }
        return {
          id: old.id,
          index: old.index,
          pages: [...old.pages],
          state: '未开始',
          note: `${trail}：未完成分片失效，丢弃部分写入后待重做`,
        }
      })
      state.tasks.push({
        id: `EXP-${next.revision.replace('R', '')}-MAIN`,
        name: `印刷交付包 · PDF/X-4 · ${next.binding}`,
        kind: 'main',
        releaseId: next.id,
        progress: 0,
        status: '已中断',
        updatedAt: stampMinute(),
        resumable: true,
        note: `从 ${previous.revision} 最后完整分片续做`,
        slices,
        processedTokens: [],
      })
      syncProgress(mainTask(next.id)!)
    }
  }

  function invalidateSlices(release: Release, taintedPages: Set<number>, trail: string) {
    for (const task of tasksOf(release.id)) {
      if (task.kind !== 'main' || task.status === '已完成' || task.status === '已冻结') continue
      for (const piece of task.slices) {
        if (piece.state !== '已完成' && piece.pages.some((pageNo) => taintedPages.has(pageNo))) {
          piece.state = '未开始'
          piece.partialPercent = undefined
          piece.hash = undefined
          piece.note = `${trail}：未完成分片与受牵连页相交，丢弃部分写入，失效重做`
        }
      }
      syncProgress(task)
    }
  }

  function syncProgress(task: ExportTask) {
    let progress = 0
    task.slices.forEach((piece) => {
      if (piece.state === '已完成') progress += 25
      else if (piece.state === '写入中') progress += 12
      else if (piece.state === '写盘失败') progress += piece.partialPercent ?? 0
    })
    task.progress = Math.min(100, Math.round(progress))
    if (task.slices.every((piece) => piece.state === '已完成')) {
      task.status = '已完成'
      task.resumable = false
      task.note = '全部分片完成，最终 PDF 页面哈希已校验'
    }
    task.updatedAt = stampMinute()
  }

  /** 按 release 幂等创建主交付包：重复提交/重试不会追加第二条任务。 */
  function ensureDeliveryTask(releaseId: string): ExportTask {
    const existing = state.tasks.find((task) => task.releaseId === releaseId && task.kind === 'main')
    if (existing) return existing
    const release = releaseById(releaseId)
    if (!release) throw new Error('release not found')

    const prior = [...state.releases]
      .reverse()
      .map((item) => mainTask(item.id))
      .find((task): task is ExportTask => Boolean(task))

    const slices: ExportSlice[] = [1, 2, 3, 4].map((index) => {
      const old = prior?.slices.find((piece) => piece.index === index)
      if (old?.state === '已完成') {
        return { ...snapshot(old), note: `沿用上一放行来源完整分片（${old.hash}）` }
      }
      return slice(index, '未开始')
    })
    const task: ExportTask = {
      id: `EXP-${release.revision.replace('R', '')}-MAIN`,
      name: `印刷交付包 · PDF/X-4 · ${release.binding}`,
      kind: 'main',
      releaseId,
      progress: 0,
      status: '排队中',
      updatedAt: stampMinute(),
      resumable: true,
      slices,
      processedTokens: [],
    }
    state.tasks.push(task)
    syncProgress(task)
    commit()
    return task
  }

  /**
   * 断点续做：写盘失败先丢弃部分写入，从最后完整分片之后重做。
   * 每次调用只推进一步；同一幂等键重试返回首次结果快照，绝不追加任务。
   */
  function resumeTask(id: string, token: string): { ok: boolean; task: ExportTask; reason: string; duplicate?: boolean } {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return { ok: false, task: undefined as unknown as ExportTask, reason: '任务不存在' }
    if (task.status === '已冻结') return { ok: false, task, reason: '任务绑定的放行来源已被替代，不能续做' }

    const seen = task.processedTokens.includes(token)
    if (seen) {
      return { ok: true, task: snapshot(task), reason: '同一续做请求重试，复用首次处理结果，不重复推进', duplicate: true }
    }

    if (task.status === '已完成') {
      task.processedTokens.push(token)
      commit()
      return { ok: true, task: snapshot(task), reason: '任务已完成，续做请求幂等返回' }
    }

    task.status = '生成中'
    const failed = task.slices.find((piece) => piece.state === '写盘失败')
    if (failed) {
      failed.state = '未开始'
      failed.partialPercent = undefined
      failed.hash = undefined
      failed.note = '重试丢弃 22% 部分写入，从最后完整分片之后重做'
    }

    const writing = task.slices.find((piece) => piece.state === '写入中')
    if (writing) {
      writing.state = '已完成'
      writing.hash = `sha256:${writing.id}-${task.releaseId.toLowerCase()}`
      writing.note = '分片写入完成并通过哈希校验'
    } else {
      const next = task.slices.find((piece) => piece.state === '未开始')
      if (next) {
        next.state = '写入中'
        next.note = '正在写入分片（可从最后完整分片断点续做）'
      }
    }

    syncProgress(task)
    task.processedTokens.push(token)
    commit()
    return { ok: true, task: snapshot(task), reason: failed ? '已丢弃失败分片的部分写入并重新开始该分片' : writing ? '一个写入中的分片已落盘' : '从最后完整分片之后启动下一分片' }
  }

  // ---------- 打样工艺依据 ----------

  /** 旧稿缺工艺依据 / 依据工艺不符：人工复核后把依据补齐为当前工艺。 */
  function reviewProof(proofId: string, reviewer: string): Proof | undefined {
    const proof = state.proofs.find((item) => item.id === proofId)
    const release = activeRelease()
    if (!proof) return undefined
    proof.bindingBasis = release.binding
    proof.reviewedAt = `${stampMinute()}（${reviewer} 复核确认适用于 ${release.binding}）`
    refreshStatus(release)
    commit()
    return proof
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = state.proofs.find((item) => item.id === id)
    if (proof) Object.assign(proof, patch)
    refreshStatus(activeRelease())
    commit()
  }

  function createProof(): Proof {
    const release = activeRelease()
    const round = state.proofs.length + 1
    const proof: Proof = {
      id: `PRF-${String(round).padStart(2, '0')}`,
      round,
      date: stamp(),
      sample: `数字样张 v${round}`,
      deltaE: 0,
      feedback: '',
      correction: '',
      owner: '当前用户',
      decision: '待决定',
      bindingBasis: release.binding,
      originReleaseId: release.id,
    }
    state.proofs.push(proof)
    commit()
    return proof
  }

  // ---------- 放行确认（乐观并发） ----------

  /**
   * 生产主管提交确认：以 baseVersion 做乐观锁。
   * 先到者占用（version+1 并记录确认人），后到者留下差异冲突，不覆盖先到结论。
   */
  function confirmRelease(supervisor: string, baseVersion: number, releaseId = state.activeReleaseId) {
    const release = releaseById(releaseId)
    if (!release) return { ok: false as const, reason: '放行来源不存在' }
    const now = stampMinute()

    if (release.version !== baseVersion) {
      const conflict: ConfirmConflict = {
        id: `CFL-${state.conflicts.length + 1}`,
        releaseId: release.id,
        revision: release.revision,
        winnerBy: release.confirmedBy ?? '（未知）',
        winnerAt: release.confirmedAt ?? '（未知）',
        winnerVersion: release.version,
        loserBy: supervisor,
        loserAt: now,
        loserBaseVersion: baseVersion,
        diff: [
          { field: '确认人', winner: release.confirmedBy ?? '（未知）', loser: supervisor },
          { field: '依据版本', winner: `v${release.version}（已占用）`, loser: `v${baseVersion}（过期提交）` },
          { field: '提交时刻', winner: release.confirmedAt ?? '（未知）', loser: now },
        ],
      }
      state.conflicts.push(conflict)
      commit()
      return { ok: false as const, conflict, release }
    }

    const readiness = releaseReadiness(release)
    if (!readiness.ok) return { ok: false as const, reason: readiness.blockers.join('；') }

    release.status = '已放行'
    release.confirmedBy = supervisor
    release.confirmedAt = now
    release.version += 1
    commit()
    return { ok: true as const, release }
  }

  // ---------- 拼版编辑 ----------

  function updatePosition(id: string, patch: Partial<Position>) {
    if (activeRelease().status === '已放行') return
    const position = state.positions.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
    commit()
  }

  function addPosition(pageNo: number, front: boolean) {
    const release = activeRelease()
    if (release.status === '已放行') return
    if (state.positions.some((item) => item.pageNo === pageNo && item.front === front)) return
    state.positions.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: 34, y: 44, rotation: 0, front })
    commit()
  }

  /** 手动重算：对当前 release 全部结论重跑一遍（幂等，已有效结论结论不变）。 */
  function rerunChecks() {
    const release = activeRelease()
    for (const verdict of spreadsOf(release.id)) {
      if (verdict.state === '已作废') continue
      const pair = foldPlan(release.binding).find((item) => item.key === verdict.key)
      if (pair) Object.assign(verdict, evaluateSpread(release, pair))
    }
    for (const verdict of bleedsOf(release.id)) {
      const page = state.pages.find((item) => item.pageNo === verdict.pageNo)
      if (page) Object.assign(verdict, evaluateBleed(release, page, state.pages))
    }
    commit()
  }

  return {
    state,
    activeRelease,
    releaseById,
    spreadsOf,
    bleedsOf,
    tasksOf,
    mainTask,
    proofBasisState,
    pendingProofs,
    staleVerdicts,
    releaseReadiness,
    changeBinding,
    reorderPages,
    ensureDraftRelease,
    reviewProof,
    updateProof,
    createProof,
    confirmRelease,
    resumeTask,
    ensureDeliveryTask,
    updatePosition,
    addPosition,
    recomputeStale,
    rerunChecks,
    foldPlan,
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    /* 无浏览器环境 */
  }
  return null
}

/** 深拷贝纯数据快照；structuredClone 无法处理 Vue 响应式 Proxy。 */
export function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

/** 全局单例：Pinia store 与模拟 REST 适配器共用同一份放行来源。 */
export const ledger = createLedger()
