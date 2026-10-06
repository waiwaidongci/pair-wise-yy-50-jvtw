<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useImpositionStore, type ExportTask } from '../stores/imposition'

const props = defineProps<{ task: ExportTask }>()
const store = useImpositionStore()

const shards = computed(() => store.taskShards(props.task.id))

function severity(status: string) {
  return status === 'complete' ? 'success' : status === 'stale' ? 'warn' : 'danger'
}

function statusLabel(status: string) {
  return status === 'complete' ? '完整分片' : status === 'stale' ? '失效待重算' : '未完成'
}

function resume() {
  store.resumeTask(props.task.id)
}

function retry() {
  // 幂等重试：同一 idempotencyKey 不重复追加任务
  store.retryTask(props.task.id, props.task.idempotencyKey)
}
</script>

<template>
  <div class="shard-panel">
    <div class="shard-head">
      <strong>分片断点</strong>
      <span class="muted">{{ shards.filter((s) => s.status === 'complete').length }}/{{ shards.length }} 完整</span>
    </div>
    <div class="shard-grid">
      <div v-for="shard in shards" :key="shard.id" :class="['shard', shard.status]">
        <div class="shard-top">
          <Tag :value="statusLabel(shard.status)" :severity="severity(shard.status)" />
          <code>P{{ shard.range[0] }}–P{{ shard.range[1] }}</code>
        </div>
        <small v-if="shard.lastCompleteAt">断点 {{ shard.lastCompleteAt }}</small>
        <small v-else>无断点</small>
      </div>
    </div>
    <div class="shard-actions">
      <Button label="从最后完整分片恢复" icon="pi pi-play" size="small" outlined @click="resume" />
      <Button label="重试（不重复追加）" icon="pi pi-refresh" size="small" text @click="retry" />
      <label class="fail-toggle"><input type="checkbox" v-model="store.failNextWrite" /> 下次写盘失败（演示回退断点）</label>
    </div>
  </div>
</template>

<style scoped>
.shard-panel { margin-top: 12px; padding: 12px; border: 1px solid #e7ebec; border-radius: 8px; background: #fafcfc; }
.shard-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.shard-head strong { font-size: 12px; }
.shard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.shard { display: grid; gap: 6px; padding: 9px; border: 1px solid #e2e8e9; border-radius: 7px; background: white; }
.shard.complete { border-color: #bfe0d2; background: #f1f9f5; }
.shard.stale { border-color: #e8c9a0; background: #fdf6ec; }
.shard-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.shard code { color: #5d7077; font-size: 11px; }
.shard small { color: #8a979d; font-size: 10px; }
.shard-actions { display: flex; align-items: center; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
.fail-toggle { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: #8a6a4a; font-size: 11px; }
</style>
