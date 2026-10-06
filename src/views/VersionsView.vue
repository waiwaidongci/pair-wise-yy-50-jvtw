<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const accepted = ref(['CH-02', 'CH-03'])
const changes = computed(() => [
  { id: 'CH-01', title: 'P7 右移 18mm 并增加出血到工艺要求', before: 'x 34 / bleed 1mm', after: `x 52 / bleed ${store.release.binding === '骑马订' ? 3 : 2}mm`, risk: '低' },
  { id: 'CH-02', title: `封面方向匹配${store.release.binding}折手`, before: 'rotation 0°', after: store.release.binding === '骑马订' ? 'rotation 180°' : 'rotation 0°', risk: '中' },
  { id: 'CH-03', title: 'P4 与 P5 跨页间距调整', before: 'gutter 10mm', after: 'gutter 6mm', risk: '中' },
  { id: 'CH-04', title: '临时改胶装后订口出血规则', before: '骑马订订口 ≥ 3mm', after: '胶装铣背订口 ≥ 2mm', risk: '高' },
])

// 模拟两位生产主管「同时」提交：两人都基于同一 version，先到者占用、后到者落差异。
const baseVersion = ref(store.release.version)
const confirmLog = ref<string[]>([])
const supervisors = ['周默 / 生产主管', '高航 / 生产主管']

function simultaneousConfirm() {
  const version = baseVersion.value
  supervisors.forEach((name) => {
    const result = store.confirmRelease(name, version)
    if (result.ok) confirmLog.value.unshift(`✓ ${name} 基于 v${version} 的确认先到，已占用放行（当前 v${result.release.version}）。`)
    else if (result.conflict) confirmLog.value.unshift(`✗ ${name} 基于 v${version} 的确认后到：放行已被 ${result.conflict.winnerBy} 占用，差异已留痕（${result.conflict.id}），未覆盖先到结论。`)
    else confirmLog.value.unshift(`✗ ${name} 的确认被拦截：${result.reason}`)
  })
}

function singleConfirm(name: string) {
  const result = store.confirmRelease(name, store.release.version)
  if (result.ok) confirmLog.value.unshift(`✓ ${name} 已确认放行 ${result.release.id}。`)
  else if (result.conflict) confirmLog.value.unshift(`✗ ${name} 版本过期，差异冲突 ${result.conflict.id} 已记录。`)
  else confirmLog.value.unshift(`✗ ${result.reason}`)
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比与放行</p><h1>放行来源审阅与主管确认</h1><p class="muted">装订工艺、跨页/出血结论、打样依据、交付分片共用 {{ store.revision }}（{{ store.release.binding }}）；确认采用版本乐观锁，先到者占用。</p></div>
      <div class="actions">
        <Button label="导出对比报告" icon="pi pi-file-export" outlined />
        <Button label="模拟两位主管同时确认" icon="pi pi-users" severity="warn" :disabled="store.locked || !store.readiness.ok" @click="simultaneousConfirm" />
      </div>
    </div>

    <Message v-if="!store.readiness.ok" severity="warn" :closable="false" class="mb-3">
      放行检查未通过：{{ store.readiness.blockers.join('；') }}。请先在拼版页重算受牵连结论、在打样页复核旧稿依据。
    </Message>
    <Message v-for="line in confirmLog.slice(0, 3)" :key="line" severity="info" :closable="false" class="mb-2">{{ line }}</Message>

    <section class="panel release-panel">
      <div class="release-grid">
        <div>
          <span class="eyebrow">RELEASE</span>
          <h2>{{ store.release.id }} · {{ store.revision }} · {{ store.release.binding }}</h2>
          <p>状态：{{ store.release.status }} · 数据版本 v{{ store.release.version }}<template v-if="store.release.confirmedBy"> · 确认人 {{ store.release.confirmedBy }}（{{ store.release.confirmedAt }}）</template></p>
        </div>
        <div class="confirm-buttons">
          <Button v-for="name in supervisors" :key="name" :label="`${name} 确认放行`" icon="pi pi-lock" size="small" :disabled="store.locked || !store.readiness.ok" @click="singleConfirm(name)" />
        </div>
      </div>
    </section>

    <div class="compare-grid">
      <section class="panel">
        <div class="panel-head"><h3>上一版折手</h3><Tag value="基线只读" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" side="front" :zoom="38" :selected="null" :validations="[]" @update="() => {}" @select="() => {}" /></div>
      </section>
      <section class="panel candidate">
        <div class="panel-head"><h3>{{ store.revision }} · {{ store.release.binding }}</h3><Tag value="当前放行来源" severity="warn" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" side="front" :zoom="38" :selected="null" :validations="store.validations" :binding="store.release.binding" @update="() => {}" @select="() => {}" /></div>
      </section>
    </div>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式与工艺变更差异</h3><span class="muted">接受 {{ accepted.length }}/{{ changes.length }} 项</span></div>
      <div class="change-list">
        <article v-for="change in changes" :key="change.id">
          <Checkbox v-model="accepted" :inputId="change.id" :value="change.id" />
          <div><strong>{{ change.id }} · {{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
          <Tag :value="`${change.risk}风险`" :severity="change.risk === '高' ? 'danger' : change.risk === '中' ? 'warn' : 'success'" />
        </article>
      </div>
    </section>

    <section v-if="store.conflictsOfRelease.length" class="panel conflict-panel">
      <div class="panel-head"><h3>并发确认差异留痕</h3><Tag :value="`${store.conflictsOfRelease.length} 条`" severity="danger" /></div>
      <div class="conflict-list">
        <article v-for="conflict in store.conflictsOfRelease" :key="conflict.id">
          <div class="conflict-id"><strong>{{ conflict.id }}</strong><Tag value="后到提交已留存" severity="danger" /></div>
          <p>先到：{{ conflict.winnerBy }} · {{ conflict.winnerAt }} · v{{ conflict.winnerVersion }} 占用</p>
          <p>后到：{{ conflict.loserBy }} · {{ conflict.loserAt }} · 基于过期 v{{ conflict.loserBaseVersion }}</p>
          <div class="diff-table">
            <span v-for="row in conflict.diff" :key="row.field"><em>{{ row.field }}</em><span class="before">{{ row.winner }}</span><i class="pi pi-arrow-right" /><span class="after">{{ row.loser }}</span></span>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.mb-3, .mb-2 { margin-bottom: 12px; }
.mb-2 { margin-bottom: 8px; }
.release-panel { margin-bottom: 14px; }
.release-grid { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; flex-wrap: wrap; }
.release-grid h2 { margin: 4px 0 6px; font-size: 18px; }
.release-grid p { margin: 0; color: #68777d; font-size: 12px; }
.confirm-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.candidate { border-color: #5d9693; }
.canvas-box { height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.change-panel { overflow: hidden; margin-bottom: 14px; }
.change-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list strong { font-size: 12px; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
.conflict-panel { border-color: #d9a99c; }
.conflict-list { padding: 8px 16px 14px; }
.conflict-list article { padding: 12px 0; border-bottom: 1px solid #f1e6e2; }
.conflict-id { display: flex; align-items: center; gap: 10px; }
.conflict-list p { margin: 5px 0; color: #7a6a63; font-size: 11px; }
.diff-table { display: grid; gap: 5px; margin-top: 8px; }
.diff-table span { display: grid; grid-template-columns: 80px 1fr 16px 1fr; align-items: center; gap: 8px; font-size: 10px; font-family: monospace; }
.diff-table em { color: #8a736b; font-style: normal; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>
