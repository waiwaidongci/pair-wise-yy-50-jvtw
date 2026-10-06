<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ShardList from '../components/ShardList.vue'
import { useImpositionStore } from '../stores/imposition'
import { exportApi } from '../api/exportApi'

const store = useImpositionStore()
const queryClient = useQueryClient()
const { data: tasks, isPending } = useQuery({
  queryKey: ['export-tasks'],
  queryFn: async () => (await exportApi.list()).data,
  initialData: store.tasks,
})
const resumeMutation = useMutation({
  mutationFn: async (id: string) => (await exportApi.resume(id)).data,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }),
})
const createMutation = useMutation({
  mutationFn: async () => (await exportApi.create('印刷交付包 · PDF/X-4', `idem-${Date.now()}`)).data,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }),
})

function statusSeverity(status?: string) {
  return status === '已完成' ? 'success' : status === '已中断' ? 'danger' : status === '生成中' ? 'warn' : 'info'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">EXPORT JOBS / 导出任务</p><h1>交付包与断点恢复</h1><p class="muted">交付任务共用放行来源；写盘失败后从最后完整分片恢复续做，重试不重复追加任务。</p></div>
      <Button label="新建印刷交付包" icon="pi pi-plus" :disabled="!store.canRelease.ok" @click="createMutation.mutate()" />
    </div>

    <Message v-if="!store.canRelease.ok" severity="warn" :closable="false" class="mb-3">
      {{ store.canRelease.reason }}。旧稿须先补齐工艺依据并经主管确认放行后，才能新建交付包。
      <Button label="去补齐工艺依据" size="small" class="ml-2" @click="$router.push('/imposition')" />
    </Message>
    <Message v-else-if="store.releaseStatus === '待复核'" severity="warn" :closable="false" class="mb-3">
      放行来源尚未确认或已失效，交付包按当前来源生成，但需主管确认后方可交付。
    </Message>

    <div class="export-grid">
      <section class="panel">
        <div class="panel-head"><h3>导出队列</h3><span class="muted">Axios 模拟 REST</span></div>
        <div v-if="isPending" class="loading">正在加载导出任务…</div>
        <div v-else class="task-list">
          <article v-for="task in (tasks ?? store.tasks)" :key="task.id">
            <div class="task-head">
              <div><strong>{{ task.name }}</strong><small>{{ task.id }} · {{ task.updatedAt }} · 来源 {{ task.basisHash }}</small></div>
              <Tag :value="task.status" :severity="statusSeverity(task.status)" />
            </div>
            <ProgressBar :value="task.progress" :showValue="false" :style="{ height: '8px' }" />
            <div class="task-foot">
              <span>{{ task.progress }}% · {{ task.progress === 100 ? '文件哈希已校验' : '保留已完成分片' }}</span>
              <Button v-if="task.resumable && task.status !== '已完成'" label="恢复任务" icon="pi pi-play" size="small" :loading="resumeMutation.isPending.value" @click="resumeMutation.mutate(task.id)" />
              <Button v-else-if="task.status !== '已完成'" label="重新生成" icon="pi pi-refresh" size="small" outlined />
              <Button v-else label="打开结果" icon="pi pi-external-link" size="small" text />
            </div>
            <ShardList :task="task" />
          </article>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>交付包内容</h3><Tag :value="store.basisHash" /></div>
          <div class="package-list">
            <div><i class="pi pi-file-pdf" /><span>拼版 PDF/X-4</span><strong>{{ store.releaseStatus === '已放行' ? '待生成' : '待复核' }}</strong></div>
            <div><i class="pi pi-check-circle" /><span>预检报告 JSON</span><strong>{{ store.validations.length }} 项</strong></div>
            <div><i class="pi pi-check-circle" /><span>色彩控制条报告</span><strong>已包含</strong></div>
            <div><i class="pi pi-check-circle" /><span>打样审批记录</span><strong>{{ store.proofs.length }} 轮</strong></div>
            <div><i class="pi pi-check-circle" /><span>装订工艺 / 折手依据</span><strong>{{ store.binding }} · {{ store.requiredBleed }}mm</strong></div>
          </div>
        </section>
        <section class="panel recovery">
          <div class="panel-head"><h3>恢复说明</h3></div>
          <p>任务分片按 2 页一组写入临时目录。写盘失败后从最后完整分片恢复续做，仅重算未完成或失效分片；重试携带同一幂等键，不重复追加任务。</p>
          <Button label="清理已完成任务" severity="secondary" outlined fluid />
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.export-grid { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 14px; align-items: start; }
.loading { padding: 30px; color: #75838a; text-align: center; }
.task-list { padding: 8px 16px 16px; }
.task-list article { padding: 15px 0; border-bottom: 1px solid #e9eeee; }
.task-head, .task-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-head { margin-bottom: 11px; }
.task-head strong, .task-head small { display: block; }
.task-head small { margin-top: 4px; color: #7c898f; font-size: 10px; }
.task-foot { margin-top: 9px; }
.task-foot span { color: #68777e; font-size: 10px; }
aside { display: grid; gap: 14px; }
.package-list { padding: 8px 16px 16px; }
.package-list div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #edf1f1; font-size: 11px; }
.package-list i { color: #397d64; }
.package-list strong { color: #536b72; font-size: 10px; }
.recovery p { padding: 0 16px; color: #67767d; font-size: 11px; line-height: 1.6; }
.recovery :deep(.p-button) { width: calc(100% - 32px); margin: 0 16px 16px; }
.mb-3 { margin-bottom: 12px; }
.ml-2 { margin-left: 8px; }
@media (max-width: 1000px) { .export-grid { grid-template-columns: 1fr; } }
</style>
