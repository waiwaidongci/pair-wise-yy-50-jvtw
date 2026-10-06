import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ledger,
  type Binding,
  type BleedVerdict,
  type ConfirmConflict,
  type ExportTask,
  type Page,
  type Position,
  type Proof,
  type Release,
  type SpreadVerdict,
  type Validation,
} from '../domain/ledger'

export type {
  Binding,
  BleedVerdict,
  ConfirmConflict,
  ExportSlice,
  ExportTask,
  Proof,
  ProofBasisState,
  Release,
  SpreadVerdict,
} from '../domain/ledger'

export type { Page, Position, Validation }

/** 纸张/工艺规格从当前放行来源读取，不再硬编码骑马订。 */
export const sheetSpec = computed(() => ({
  width: 720,
  height: 1020,
  bleed: ledger.activeRelease().binding === '骑马订' ? 3 : 2,
  safe: 5,
  gutter: 6,
  binding: ledger.activeRelease().binding as Binding,
  grain: '纵向',
}))

export const useImpositionStore = defineStore('imposition', () => {
  const state = ledger.state

  const release = computed<Release>(() => ledger.activeRelease())
  const revision = computed(() => release.value.revision)
  const locked = computed(() => release.value.status === '已放行')
  const spreads = computed<SpreadVerdict[]>(() => ledger.spreadsOf())
  const bleeds = computed<BleedVerdict[]>(() => ledger.bleedsOf())
  const conflicts = computed<ConfirmConflict[]>(() => state.conflicts.filter((item) => item.releaseId === release.value.id))
  const pendingProofs = computed(() => ledger.pendingProofs())
  const readiness = computed(() => ledger.releaseReadiness())

  /** 兼容旧版画布/总览的扁平校验列表，数据同样来自放行台账。 */
  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const placedPages = state.positions.map((position) => position.pageNo)
    state.pages.forEach((page) => {
      if (!placedPages.includes(page.pageNo)) {
        issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      }
    })
    for (const verdict of bleeds.value) {
      if (verdict.state === '待重算') {
        issues.push({ id: verdict.id, severity: '警告', pageNo: verdict.pageNo, title: `P${verdict.pageNo} 出血结论待重算`, detail: `${verdict.edge}受工艺/页序调整牵连，旧结论已失效。` })
      } else if (verdict.pass === false) {
        issues.push({ id: verdict.id, severity: '错误', pageNo: verdict.pageNo, title: `P${verdict.pageNo} 出血不足`, detail: `${release.value.binding}${verdict.edge}要求 ${verdict.required}mm，文件出血 ${verdict.actual}mm。` })
      }
    }
    for (const verdict of spreads.value) {
      if (verdict.state === '待重算') {
        issues.push({ id: verdict.id, severity: '警告', title: `跨页 ${verdict.key} 待重算`, detail: verdict.reason })
      } else if (verdict.pass === false) {
        issues.push({ id: verdict.id, severity: '错误', title: `跨页 ${verdict.key} 未完成拼版`, detail: verdict.reason })
      }
    }
    for (let index = 0; index < state.positions.length; index += 1) {
      for (let next = index + 1; next < state.positions.length; next += 1) {
        const a = state.positions[index]
        const b = state.positions[next]
        if (a.front === b.front && Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 430) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    return issues
  })

  function updatePosition(id: string, patch: Partial<Position>) {
    ledger.updatePosition(id, patch)
  }

  function addPosition(pageNo: number) {
    ledger.addPosition(pageNo, side.value === 'front')
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    ledger.updateProof(id, patch)
  }

  function createProof() {
    ledger.createProof()
  }

  function lockBaseline(supervisor = '生产主管') {
    const current = ledger.activeRelease()
    const base = current.version
    if (current.status !== '已放行') ledger.ensureDraftRelease()
    return ledger.confirmRelease(supervisor, base)
  }

  function unlock() {
    // 放行后不允许直接解锁，只能开同工艺修订版
    ledger.ensureDraftRelease()
  }

  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  return {
    // 台账状态（只读引用，修改必须走方法）
    pages: state.pages as Page[],
    positions: state.positions as Position[],
    proofs: state.proofs as Proof[],
    tasks: state.tasks as ExportTask[],
    conflicts: state.conflicts as ConfirmConflict[],
    release,
    revision,
    locked,
    spreads,
    bleeds,
    conflictsOfRelease: conflicts,
    pendingProofs,
    readiness,
    validations,
    side,
    zoom,
    selectedPosition,
    selectedProof,
    // 台账操作
    changeBinding: ledger.changeBinding,
    reorderPages: ledger.reorderPages,
    reviewProof: ledger.reviewProof,
    proofBasisState: ledger.proofBasisState,
    recomputeStale: ledger.recomputeStale,
    rerunChecks: ledger.rerunChecks,
    confirmRelease: ledger.confirmRelease,
    resumeTask: ledger.resumeTask,
    ensureDeliveryTask: ledger.ensureDeliveryTask,
    updatePosition,
    addPosition,
    updateProof,
    createProof,
    lockBaseline,
    unlock,
    foldPlan: ledger.foldPlan,
  }
})
