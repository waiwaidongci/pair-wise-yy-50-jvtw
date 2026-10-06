<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { storeToRefs } from 'pinia'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const { releaseStatus, basisHash, canRelease, confirmedBy, confirmedAt, diffs, lastAffected, processBasis } = storeToRefs(store)

const confirmMsg = ref('')

function confirm(actor: string) {
  const result = store.confirmRelease(actor, basisHash.value)
  if (result.outcome === 'occupied') {
    confirmMsg.value = `${actor} 已占用放行来源 ${basisHash.value}`
  } else if (result.outcome === 'conflict') {
    confirmMsg.value = `${actor} 后到，差异已留待裁决（${result.reason}）`
  } else {
    confirmMsg.value = `${actor} 确认被拒：${result.reason}`
  }
}

function diffSeverity(status: string) {
  return status === '已采纳' ? 'success' : status === '已驳回' ? 'danger' : 'warn'
}
</script>

<template>
  <section class="panel release-panel">
    <div class="panel-head">
      <h3>放行来源</h3>
      <Tag :value="releaseStatus" :severity="releaseStatus === '已放行' ? 'success' : 'warn'" />
    </div>

    <div class="basis-grid">
      <div class="basis-item"><span>来源指纹</span><code>{{ basisHash }}</code></div>
      <div class="basis-item"><span>装订工艺</span><strong>{{ store.binding }}</strong></div>
      <div class="basis-item"><span>拼版版本</span><strong>{{ store.revision }}</strong></div>
      <div class="basis-item"><span>打样轮次</span><strong>第 {{ store.latestProofRound }} 轮</strong></div>
      <div class="basis-item"><span>工艺依据</span><strong>{{ processBasis ?? '缺失（旧稿）' }}</strong></div>
      <div class="basis-item"><span>占用确认</span><strong>{{ confirmedBy ? `${confirmedBy} · ${confirmedAt}` : '未占用' }}</strong></div>
    </div>

    <Message v-if="!canRelease.ok" severity="warn" :closable="false" class="mt-2">
      {{ canRelease.reason }}。补齐工艺依据后才可放行导出。
      <Button label="补齐工艺依据" size="small" class="ml-2" @click="store.establishProcessBasis" />
    </Message>

    <Message v-else-if="releaseStatus === '待复核'" severity="warn" :closable="false" class="mt-2">
      放行来源尚未确认，或工艺/页序已调整导致已确认指纹失效。请主管确认后再导出。
    </Message>

    <div v-if="lastAffected" class="affected">
      <strong>最近一次调整牵连</strong>
      <ul>
        <li v-for="(reason, i) in lastAffected.reasons" :key="i">{{ reason }}</li>
      </ul>
      <div class="affected-count">
        <Tag :value="`跨页重算 ${lastAffected.affectedSpreadKeys.length}`" severity="warn" />
        <Tag :value="`出血结论重算 ${lastAffected.affectedPages.length}`" severity="warn" />
        <Tag value="无关页面照旧" severity="success" />
      </div>
    </div>

    <div class="confirm-row">
      <Button label="周默确认（先到）" icon="pi pi-user" size="small" outlined @click="confirm('周默')" />
      <Button label="林青确认（后到）" icon="pi pi-user" size="small" outlined @click="confirm('林青')" />
      <span v-if="confirmMsg" class="confirm-msg">{{ confirmMsg }}</span>
    </div>

    <div v-if="diffs.length" class="diff-list">
      <div class="diff-head">后到者差异（留差异）</div>
      <article v-for="diff in diffs" :key="diff.id">
        <div>
          <strong>{{ diff.actor }} · {{ diff.id }}</strong>
          <small>{{ diff.receivedAt }} · {{ diff.payload }} · 指纹 {{ diff.basisHash }}</small>
        </div>
        <Tag :value="diff.status" :severity="diffSeverity(diff.status)" />
        <div class="diff-actions">
          <Button label="采纳" size="small" text @click="store.acknowledgeDiff(diff.id, '已采纳')" />
          <Button label="驳回" size="small" text severity="danger" @click="store.acknowledgeDiff(diff.id, '已驳回')" />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.release-panel { margin-bottom: 12px; }
.basis-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px 16px; }
.basis-item { display: grid; gap: 4px; }
.basis-item span { color: #7a878d; font-size: 10px; }
.basis-item strong { font-size: 12px; }
.basis-item code { padding: 3px 6px; border-radius: 4px; background: #eef3f3; color: #2c5c66; font-size: 11px; }
.mt-2 { margin-top: 0; margin-inline: 16px; }
.ml-2 { margin-left: 8px; }
.affected { margin: 12px 16px 0; padding: 11px 12px; border-left: 3px solid #c98236; background: #fff8ee; }
.affected strong { font-size: 12px; }
.affected ul { margin: 6px 0 0; padding-left: 18px; color: #7a5a3a; font-size: 11px; line-height: 1.6; }
.affected-count { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
.confirm-row { display: flex; align-items: center; gap: 8px; padding: 14px 16px 4px; flex-wrap: wrap; }
.confirm-msg { color: #5d7077; font-size: 11px; }
.diff-list { margin: 12px 16px 16px; border: 1px solid #e7ebec; border-radius: 8px; overflow: hidden; }
.diff-head { padding: 8px 12px; background: #f4f6f6; color: #6a7a80; font-size: 11px; font-weight: 700; }
.diff-list article { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 12px; border-top: 1px solid #eef1f1; }
.diff-list strong, .diff-list small { display: block; }
.diff-list strong { font-size: 12px; }
.diff-list small { margin-top: 3px; color: #8a979d; font-size: 10px; }
.diff-actions { display: flex; gap: 2px; }
</style>
