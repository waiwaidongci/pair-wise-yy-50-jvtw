<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore } from '../stores/imposition'
import type { Binding } from '../domain/ledger'

const store = useImpositionStore()
const sideOptions = [
  { label: '正面', value: 'front' },
  { label: '反面', value: 'back' },
]
const bindingOptions: Binding[] = ['骑马订', '胶装']
const selected = computed(() => store.positions.find((item) => item.id === store.selectedPosition))
const activeValidations = computed(() => store.validations.filter((item) => !item.pageNo || item.pageNo === selected.value?.pageNo || sideContains(item.pageNo)))
const staleSpreads = computed(() => store.spreads.filter((item) => item.state === '待重算'))
const staleBleeds = computed(() => store.bleeds.filter((item) => item.state === '待重算'))

const reorderA = ref<number | null>(null)
const reorderB = ref<number | null>(null)
const pageOptions = computed(() => store.pages.map((page) => page.pageNo))

const notice = ref<{ severity: 'success' | 'warn' | 'error'; text: string } | null>(null)

function sideContains(pageNo?: number) {
  if (!pageNo) return true
  return store.positions.some((position) => position.pageNo === pageNo && position.front === (store.side === 'front'))
}

function locate(pageNo?: number) {
  const position = store.positions.find((item) => item.pageNo === pageNo)
  if (position) {
    store.selectedPosition = position.id
    store.side = position.front ? 'front' : 'back'
  }
}

function switchBinding(target: Binding) {
  if (target === store.release.binding) return
  store.changeBinding(target)
  reorderA.value = null
  reorderB.value = null
  notice.value = { severity: 'warn', text: `已按 ${target} 新建放行来源：折手签名/订口规则受牵连的跨页与出血结论失效待重算，无关跨页照旧沿用。` }
}

function applyReorder() {
  if (reorderA.value == null || reorderB.value == null || reorderA.value === reorderB.value) {
    notice.value = { severity: 'error', text: '请选择两个不同的页面槽位再调整页序。' }
    return
  }
  store.reorderPages(reorderA.value, reorderB.value)
  notice.value = { severity: 'warn', text: `P${reorderA.value} ↔ P${reorderB.value} 已调整：仅这两页涉及的跨页、出血结论与未完成分片失效，其余页面照旧。` }
  reorderA.value = null
  reorderB.value = null
}

function recompute() {
  store.recomputeStale()
  notice.value = { severity: 'success', text: '受牵连结论已按新工艺/页序重算完成；沿用项保持原结论未重跑。' }
}

function releaseStatusSeverity(status: string) {
  return status === '已放行' ? 'success' : status === '待复核' ? 'warn' : 'info'
}

function verdictSeverity(state: string, pass: boolean | null) {
  if (state === '待重算') return 'warn'
  if (pass === false) return 'danger'
  return 'success'
}

function verdictText(item: { state: string; pass: boolean | null }) {
  if (item.state === '待重算') return '待重算'
  if (item.pass === false) return '不通过'
  return '有效'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">IMPOSITION / 拼版工作区</p><h1>Canvas 版位编排与放行台账</h1><p class="muted">装订工艺、跨页/出血结论、打样依据与交付分片共用一份放行来源；工艺或页序调整只失效受牵连项。</p></div>
      <div class="actions">
        <Button label="重算受牵连结论" icon="pi pi-refresh" severity="warn" outlined :disabled="staleSpreads.length + staleBleeds.length === 0" @click="recompute" />
        <Button label="运行完整预检" icon="pi pi-check-circle" outlined @click="store.rerunChecks()" />
      </div>
    </div>

    <Message v-if="notice" :severity="notice.severity" closable class="mb-3" @close="notice = null">{{ notice.text }}</Message>
    <Message v-if="store.readiness.blockers.length" severity="warn" :closable="false" class="mb-3">
      放行来源 {{ store.revision }} 尚不能锁定：{{ store.readiness.blockers.join('；') }}。
    </Message>

    <div class="release-bar panel">
      <div class="release-id">
        <span class="eyebrow">RELEASE SOURCE / 单一放行来源</span>
        <div class="release-line">
          <strong>{{ store.release.id }} · {{ store.revision }}</strong>
          <Tag :value="store.release.status" :severity="releaseStatusSeverity(store.release.status)" />
          <Tag v-if="store.release.confirmedBy" :value="`${store.release.confirmedBy} 已确认 v${store.release.version}`" severity="success" />
          <Tag v-else value="未确认" />
        </div>
      </div>
      <label class="binding-pick">装订工艺
        <Select :model-value="store.release.binding" :options="bindingOptions" :disabled="store.locked" style="width:130px" @update:model-value="switchBinding" />
      </label>
      <div class="reorder-pick">
        <span>页序调整（仅失效受牵连项）</span>
        <div>
          <Select v-model="reorderA" :options="pageOptions" placeholder="槽位" style="width:88px" :disabled="store.locked" />
          <i class="pi pi-arrows-h" />
          <Select v-model="reorderB" :options="pageOptions" placeholder="槽位" style="width:88px" :disabled="store.locked" />
          <Button label="应用" icon="pi pi-check" size="small" :disabled="store.locked" @click="applyReorder" />
        </div>
      </div>
      <div class="lock-pick">
        <Button v-if="!store.locked" label="提交确认并锁定" icon="pi pi-lock" size="small" :disabled="!store.readiness.ok" @click="store.lockBaseline('林青 / 生产主管')" />
        <Button v-else label="放行后开修订版" icon="pi pi-lock-open" size="small" severity="warn" outlined @click="store.unlock" />
      </div>
    </div>

    <div class="toolbar panel">
      <SelectButton v-model="store.side" :options="sideOptions" optionLabel="label" optionValue="value" />
      <span class="muted">缩放 {{ store.zoom }}%</span>
      <Slider v-model="store.zoom" :min="35" :max="100" :step="5" style="width:150px" />
      <span class="paper-spec">720 × 1020mm · {{ store.release.binding }}订口出血 {{ store.release.binding === '骑马订' ? 3 : 2 }}mm · 安全区 5mm · {{ store.locked ? '基线只读' : '编辑中' }}</span>
    </div>

    <div class="imposition-grid">
      <aside class="panel pages-panel">
        <div class="panel-head"><h3>页面文件</h3><Tag :value="`${store.pages.length}P`" /></div>
        <div class="page-list">
          <button v-for="page in store.pages" :key="page.pageNo" :disabled="store.positions.some((item) => item.pageNo === page.pageNo && item.front === (store.side === 'front')) || store.locked" @click="store.addPosition(page.pageNo)">
            <div class="thumb"><span>P{{ page.pageNo }}</span><i /></div>
            <div><strong>{{ page.name }}</strong><small>{{ page.width }}×{{ page.height }} · 出血 {{ page.bleed }}mm</small></div>
            <i class="pi pi-plus" />
          </button>
        </div>
      </aside>

      <section class="panel canvas-panel">
        <div class="panel-head"><h3>{{ store.side === 'front' ? '正面版式' : '反面版式' }}</h3><span class="muted">拖动页面 · 点击选择</span></div>
        <div class="canvas-scroll">
          <ImpositionCanvas
            :positions="store.positions"
            :side="store.side"
            :zoom="store.zoom"
            :selected="store.selectedPosition"
            :validations="store.validations"
            :binding="store.release.binding"
            @select="store.selectedPosition = $event"
            @update="store.updatePosition"
          />
        </div>
      </section>

      <aside class="right-panel">
        <section class="panel">
          <div class="panel-head"><h3>版位属性</h3><Tag v-if="selected" :value="selected.id" /></div>
          <div v-if="selected" class="properties">
            <label>页面<select :value="selected.pageNo" :disabled="store.locked" @change="store.updatePosition(selected.id, { pageNo: Number(($event.target as HTMLSelectElement).value) })"><option v-for="page in store.pages" :key="page.pageNo" :value="page.pageNo">P{{ page.pageNo }} · {{ page.name }}</option></select></label>
            <div class="pair"><label>X<input type="number" :value="selected.x" :disabled="store.locked" @change="store.updatePosition(selected.id, { x: Number(($event.target as HTMLInputElement).value) })" /></label><label>Y<input type="number" :value="selected.y" :disabled="store.locked" @change="store.updatePosition(selected.id, { y: Number(($event.target as HTMLInputElement).value) })" /></label></div>
            <label>旋转方向<select :value="selected.rotation" :disabled="store.locked" @change="store.updatePosition(selected.id, { rotation: Number(($event.target as HTMLSelectElement).value) })"><option :value="0">0°</option><option :value="90">顺时针 90°</option><option :value="180">倒置 180°</option><option :value="270">顺时针 270°</option></select></label>
            <div class="binding-note"><i class="pi pi-info-circle" /><span>{{ store.pages.find((page) => page.pageNo === selected?.pageNo)?.content }}</span></div>
          </div>
          <div v-else class="empty">在画布中选择一个版位以编辑属性。</div>
        </section>

        <section class="panel verdict-panel">
          <div class="panel-head"><h3>折手跨页结论</h3><Tag :value="`${staleSpreads.length} 待重算`" :severity="staleSpreads.length ? 'warn' : 'success'" /></div>
          <div class="verdict-list">
            <div v-for="item in store.spreads" :key="item.id" class="verdict-row">
              <i :class="[item.state === '待重算' ? 'pi pi-clock' : item.pass === false ? 'pi pi-times-circle' : 'pi pi-check-circle', item.state === '待重算' ? 'stale' : item.pass === false ? 'bad' : 'ok']" />
              <div><strong>{{ item.label }} · P{{ item.leftPage }}/P{{ item.rightPage }}</strong><p>{{ item.reason }}</p></div>
              <Tag :value="verdictText(item)" :severity="verdictSeverity(item.state, item.pass)" />
            </div>
          </div>
        </section>

        <section class="panel verdict-panel">
          <div class="panel-head"><h3>订口出血结论</h3><Tag :value="`${staleBleeds.length} 待重算`" :severity="staleBleeds.length ? 'warn' : 'success'" /></div>
          <div class="verdict-list">
            <div v-for="item in store.bleeds" :key="item.id" class="verdict-row">
              <i :class="[item.state === '待重算' ? 'pi pi-clock' : item.pass === false ? 'pi pi-times-circle' : 'pi pi-check-circle', item.state === '待重算' ? 'stale' : item.pass === false ? 'bad' : 'ok']" />
              <div><strong>P{{ item.pageNo }} · {{ item.edge }}（{{ store.release.binding }} ≥ {{ item.required }}mm）</strong><p>文件 {{ item.actual }}mm · {{ item.reason }}</p></div>
              <Tag :value="verdictText(item)" :severity="verdictSeverity(item.state, item.pass)" />
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>预检结果</h3><Tag :value="`${activeValidations.length} 项`" :severity="activeValidations.some((item) => item.severity === '错误') ? 'danger' : 'warn'" /></div>
          <div class="validation-list">
            <button v-for="issue in activeValidations" :key="issue.id" :class="issue.severity" @click="locate(issue.pageNo)">
              <i :class="issue.severity === '错误' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'" />
              <div><strong>{{ issue.title }}</strong><p>{{ issue.detail }}</p></div>
              <i class="pi pi-arrow-right" />
            </button>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.mb-3 { margin-bottom: 12px; }
.release-bar { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; padding: 14px 16px; }
.release-id { min-width: 250px; }
.release-line { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.release-line strong { font-size: 15px; }
.binding-pick, .reorder-pick { display: grid; gap: 6px; color: #5f7076; font-size: 11px; font-weight: 700; }
.reorder-pick > div { display: flex; align-items: center; gap: 7px; }
.reorder-pick > div > i { color: #8a979d; }
.lock-pick { margin-left: auto; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding: 12px; }
.paper-spec { margin-left: auto; color: #5d7077; font-size: 11px; }
.imposition-grid { display: grid; grid-template-columns: 220px minmax(0,1fr) 360px; gap: 12px; align-items: start; }
.pages-panel { max-height: 760px; overflow: auto; }
.page-list { padding: 8px; }
.page-list button { display: grid; width: 100%; grid-template-columns: 42px 1fr auto; gap: 8px; align-items: center; padding: 8px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.page-list button:hover:not(:disabled) { background: #eff5f4; }
.page-list button:disabled { opacity: .42; cursor: not-allowed; }
.thumb { display: grid; width: 38px; height: 50px; place-items: center; border: 1px solid #bdc7c9; background: #f4f3ef; font-size: 9px; font-weight: 800; }
.thumb i { width: 18px; height: 2px; background: #c36f42; }
.page-list strong, .page-list small { display: block; }
.page-list strong { font-size: 11px; }
.page-list small { margin-top: 4px; color: #7c898e; font-size: 9px; }
.canvas-panel { min-width: 0; }
.canvas-scroll { max-height: 760px; overflow: auto; padding: 18px; background: #34464c; }
.right-panel { display: grid; gap: 12px; }
.properties { display: grid; gap: 12px; padding: 14px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.properties label { display: grid; gap: 5px; color: #5f7076; font-size: 11px; font-weight: 700; }
.properties input, .properties select { width: 100%; padding: 8px; border: 1px solid #cbd5d7; border-radius: 6px; font: inherit; }
.binding-note { display: flex; gap: 7px; padding: 9px; color: #6a604f; background: #fff5e7; font-size: 11px; line-height: 1.5; }
.empty { padding: 28px; color: #7e8a8f; text-align: center; font-size: 12px; }
.verdict-list { padding: 8px 14px 12px; }
.verdict-row { display: grid; grid-template-columns: 20px 1fr auto; gap: 9px; align-items: start; padding: 9px 0; border-bottom: 1px solid #edf1f1; }
.verdict-row i { margin-top: 2px; }
.verdict-row i.stale { color: #c4872f; }
.verdict-row i.bad { color: #bd4a34; }
.verdict-row i.ok { color: #3b8a67; }
.verdict-row strong { display: block; font-size: 11px; }
.verdict-row p { margin: 3px 0 0; color: #738087; font-size: 10px; line-height: 1.45; }
.validation-list { max-height: 340px; overflow: auto; padding: 7px; }
.validation-list button { display: grid; width: 100%; grid-template-columns: 22px 1fr 16px; gap: 7px; padding: 10px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.validation-list button:hover { background: #f5f7f7; }
.validation-list button.error > i:first-child { color: #bd4a34; }
.validation-list button.warning > i:first-child { color: #bf7f2c; }
.validation-list strong { font-size: 11px; }
.validation-list p { margin: 4px 0 0; color: #738087; font-size: 10px; line-height: 1.45; }
@media (max-width: 1200px) { .imposition-grid { grid-template-columns: 200px minmax(0,1fr); } .right-panel { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } }
@media (max-width: 760px) { .imposition-grid { grid-template-columns: 1fr; } .right-panel { grid-template-columns: 1fr; } .pages-panel { max-height: 300px; } .lock-pick { margin-left: 0; } }
</style>
