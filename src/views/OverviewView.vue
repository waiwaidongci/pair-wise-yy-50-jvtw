<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const errors = computed(() => store.validations.filter((item) => item.severity === '错误').length)
const staleCount = computed(() => store.spreads.filter((item) => item.state === '待重算').length + store.bleeds.filter((item) => item.state === '待重算').length)
const carriedCount = computed(() => store.spreads.filter((item) => item.reason.includes('沿用')).length)
const pendingProof = computed(() => store.proofs.find((proof) => proof.decision === '待决定'))
const mainTask = computed(() => store.tasks.find((task) => task.releaseId === store.release.id && task.kind === 'main'))
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">PRINT PRODUCTION / 印刷生产</p><h1>拼版预检与放行来源总览</h1><p class="muted">装订工艺、拼版版本、打样依据与交付分片共用一份放行来源，工艺/页序调整只重算受牵连项。</p></div>
      <div class="actions"><Button label="运行完整预检" icon="pi pi-check-circle" outlined @click="store.rerunChecks()" /><Button label="进入拼版工作区" icon="pi pi-th-large" @click="$router.push('/imposition')" /></div>
    </div>

    <div class="metric-grid">
      <article class="metric"><span>页面文件</span><strong>{{ store.pages.length }}</strong><small>{{ store.positions.length }} 个已排版位</small></article>
      <article class="metric"><span>预检错误</span><strong class="error">{{ errors }}</strong><small>{{ staleCount }} 项受牵连待重算</small></article>
      <article class="metric"><span>打样轮次</span><strong>{{ store.proofs.length }}</strong><small>{{ store.pendingProofs.length }} 份工艺依据待复核</small></article>
      <article class="metric"><span>放行来源</span><strong>{{ store.revision }}</strong><small>{{ store.release.binding }} · {{ store.release.status }}</small></article>
    </div>

    <div class="overview-grid">
      <section class="panel">
        <div class="panel-head"><h3>当前放行来源</h3><Tag :value="store.release.id" severity="info" /></div>
        <div class="project-card">
          <div>
            <strong>《潮汐来信》上海巡演节目册</strong>
            <p>成品 210 × 297mm · 8P · {{ store.release.binding }} · 720 × 1020mm 对开纸</p>
            <div class="specs"><span>CMYK + 专色</span><span>纵向纸纹</span><span>PDF/X-4</span><span :class="{ stale: store.release.binding === '胶装' }">{{ store.release.binding === '胶装' ? '胶装订口 ≥ 2mm' : '骑马订折位 ≥ 3mm' }}</span></div>
          </div>
          <Button label="打开拼版" icon="pi pi-arrow-right" @click="$router.push('/imposition')" />
        </div>
        <div class="checklist">
          <div><i class="pi pi-check-circle" /><span>页面尺寸与成品规格</span><Tag value="通过" severity="success" /></div>
          <div><i :class="staleCount ? 'pi pi-clock warn' : 'pi pi-check-circle'" /><span>折手跨页与订口出血结论</span><Tag :value="staleCount ? `${staleCount} 待重算 · ${carriedCount} 沿用` : '全部有效'" :severity="staleCount ? 'warn' : 'success'" /></div>
          <div><i :class="errors ? 'pi pi-times-circle error' : 'pi pi-check-circle'" /><span>出血与版位安全区</span><Tag :value="`${errors} 项错误`" :severity="errors ? 'danger' : 'success'" /></div>
          <div><i :class="store.pendingProofs.length ? 'pi pi-clock warn' : 'pi pi-check-circle'" /><span>打样工艺依据</span><Tag :value="store.pendingProofs.length ? `${store.pendingProofs.length} 份待复核` : '依据完整'" :severity="store.pendingProofs.length ? 'warn' : 'success'" /></div>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>最近打样</h3><Button label="查看全部" text size="small" @click="$router.push('/proofs')" /></div>
          <div class="proof-summary">
            <template v-for="proof in store.proofs.slice().reverse()" :key="proof.id">
              <div class="proof-row">
                <div><strong>第 {{ proof.round }} 轮 · {{ proof.sample }}</strong><small>{{ proof.date }} · ΔE {{ proof.deltaE }} · 依据 {{ proof.bindingBasis ?? '缺失' }}</small></div>
                <div class="proof-tags">
                  <Tag v-if="store.proofBasisState(proof) !== '依据完整'" value="待复核" severity="warn" />
                  <Tag :value="proof.decision" :severity="proof.decision === '通过' ? 'success' : proof.decision === '退回' ? 'danger' : 'warn'" />
                </div>
              </div>
            </template>
          </div>
        </section>
        <section class="panel export-mini">
          <div class="panel-head"><h3>交付分片（{{ store.revision }}）</h3><Button label="导出页" text size="small" @click="$router.push('/exports')" /></div>
          <template v-if="mainTask">
            <div>
              <div><span>{{ mainTask.name }}</span><strong>{{ mainTask.progress }}%</strong></div>
              <ProgressBar :value="mainTask.progress" :showValue="false" :style="{ height: '7px' }" />
              <small>{{ mainTask.status }} · {{ mainTask.updatedAt }}</small>
              <div class="slice-mini">
                <Tag v-for="piece in mainTask.slices" :key="piece.id" :value="`S${piece.index} ${piece.state === '已完成' ? '✓' : piece.state === '写盘失败' ? '!' : '…'}`" :severity="piece.state === '已完成' ? 'success' : piece.state === '写盘失败' ? 'danger' : 'secondary'" />
              </div>
            </div>
          </template>
          <div v-else class="empty-mini">当前放行来源尚未建交付包。</div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.metric .error { color: #b84e35; }
.overview-grid { display: grid; grid-template-columns: minmax(0,1fr) 350px; gap: 14px; align-items: start; }
.project-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px; }
.project-card strong { font-size: 17px; }
.project-card p { margin: 7px 0 14px; color: #66757c; }
.specs { display: flex; flex-wrap: wrap; gap: 7px; }
.specs span { padding: 5px 8px; border-radius: 5px; color: #45676d; background: #eef4f4; font-size: 10px; }
.specs span.stale { color: #8a5c28; background: #fdf2e2; }
.checklist { padding: 0 18px 16px; }
.checklist > div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 9px; padding: 11px 0; border-top: 1px solid #ecf0f0; font-size: 12px; }
.checklist i { color: #3b8a67; }
.checklist i.warn { color: #c4872f; }
.checklist i.error { color: #bb4c35; }
aside { display: grid; gap: 14px; }
.proof-summary { padding: 8px 16px 14px; }
.proof-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid #edf1f1; }
.proof-row strong, .proof-row small { display: block; }
.proof-row small { margin-top: 4px; color: #7a878d; font-size: 10px; }
.proof-tags { display: grid; gap: 4px; justify-items: end; }
.export-mini > div:not(.panel-head) { padding: 11px 16px 14px; }
.export-mini > div > div { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
.export-mini small { display: block; margin-top: 5px; color: #7d898e; }
.slice-mini { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
.empty-mini { padding: 16px; color: #8a969b; font-size: 11px; }
@media (max-width: 1050px) { .overview-grid { grid-template-columns: 1fr; } }
</style>
