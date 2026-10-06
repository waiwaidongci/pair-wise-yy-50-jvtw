<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useImpositionStore } from '../stores/imposition'
import { exportApi } from '../api/exportApi'
import type { ExportSlice } from '../stores/imposition'

const store = useImpositionStore()
const queryClient = useQueryClient()
const releaseId = computed(() => store.release.id)

const { data: tasks, isPending } = useQuery({
  queryKey: ['export-tasks', releaseId],
  queryFn: async () => (await exportApi.list(releaseId.value)).data,
})
watch(releaseId, () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }))

// 同一放行来源的建包请求复用一个幂等键：网络重试/重复点击都不会追加任务。
const createKey = ref(`create-${releaseId.value}`)
watch(releaseId, (id) => { createKey.value = `create-${id}` })

const createMutation = useMutation({
  mutationFn: async () => (await exportApi.create(releaseId.value, createKey.value)).data,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }),
})

const resumeMutation = useMutation({
  mutationFn: async (id: string) => {
    // 每次「恢复」是一次新的续做尝试；同一次尝试若因网络原因重试，适配器用同一 token 去重。
    const token = `resume-${id}-${Date.now()}`
    return (await exportApi.resume(id, token)).data
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-tasks'] }),
})

const lastResume = ref<{ reason: string; duplicate?: boolean } | null>(null)
watch(resumeMutation.data, (value) => { if (value) lastResume.value = { reason: value.reason, duplicate: value.duplicate } })

const frozenTasks = computed(() => store.tasks.filter((task) => task.status === '已冻结'))

function statusSeverity(status?: string) {
  return status === '已完成' ? 'success' : status === '已中断' ? 'danger' : status === '生成中' ? 'warn' : status === '已冻结' ? 'secondary' : 'info'
}

function sliceSeverity(state: ExportSlice['state']) {
  return state === '已完成' ? 'success' : state === '写盘失败' ? 'danger' : state === '写入中' ? 'warn' : 'secondary'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">EXPORT JOBS / 导出任务</p><h1>交付包与断点恢复</h1><p class="muted">交付任务挂在放行来源 {{ store.revision }}（{{ store.release.binding }}）下：已完成分片凭哈希沿用，写盘失败丢弃部分写入后从最后完整分片续做，重试不追加任务。</p></div>
      <Button label="新建印刷交付包" icon="pi pi-plus" :loading="createMutation.isPending.value" @click="createMutation.mutate()" />
    </div>

    <div v-if="lastResume" class="resume-note panel"><i class="pi pi-info-circle" /><span>{{ lastResume.reason }}<template v-if="lastResume.duplicate">（幂等命中，未重复推进）</template></span></div>

    <div class="export-grid">
      <section class="panel">
        <div class="panel-head"><h3>导出队列 · {{ store.revision }}</h3><span class="muted">Axios 模拟 REST · 与台账同源</span></div>
        <div v-if="isPending" class="loading">正在加载导出任务…</div>
        <div v-else class="task-list">
          <article v-for="task in (tasks ?? [])" :key="task.id">
            <div class="task-head">
              <div><strong>{{ task.name }}</strong><small>{{ task.id }} · {{ task.updatedAt }} · 已处理续做请求 {{ task.processedTokens.length }} 次</small></div>
              <Tag :value="task.status" :severity="statusSeverity(task.status)" />
            </div>
            <ProgressBar :value="task.progress" :showValue="false" :style="{ height: '8px' }" />
            <div class="slice-grid">
              <div v-for="piece in task.slices" :key="piece.id" class="slice" :class="piece.state">
                <div class="slice-head"><strong>分片 {{ piece.index }} · P{{ piece.pages.join('/P') }}</strong><Tag :value="piece.state" :severity="sliceSeverity(piece.state)" /></div>
                <p>{{ piece.note }}</p>
                <small v-if="piece.hash">哈希 {{ piece.hash }}</small>
                <small v-else-if="piece.partialPercent">部分写入 {{ piece.partialPercent }}%（不保留）</small>
              </div>
            </div>
            <div class="task-foot">
              <span>{{ task.progress }}% · {{ task.note ?? (task.progress === 100 ? '文件哈希已校验' : '从最后完整分片续做') }}</span>
              <Button v-if="task.resumable && task.status !== '已完成'" label="恢复任务" icon="pi pi-play" size="small" :loading="resumeMutation.isPending.value" @click="resumeMutation.mutate(task.id)" />
              <Button v-else-if="task.status !== '已完成' && task.status !== '已冻结'" label="重新生成" icon="pi pi-refresh" size="small" outlined />
              <Button v-else-if="task.status === '已完成'" label="打开结果" icon="pi pi-external-link" size="small" text />
            </div>
          </article>
          <div v-if="!(tasks ?? []).length" class="loading">当前放行来源还没有交付任务。</div>
        </div>

        <div v-if="frozenTasks.length" class="frozen">
          <h4><i class="pi pi-snowflake" /> 已被新工艺替代的冻结任务</h4>
          <div v-for="task in frozenTasks" :key="task.id">
            <strong>{{ task.name }}</strong>
            <p>{{ task.note }}</p>
          </div>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>交付包内容</h3><Tag :value="store.revision" /></div>
          <div class="package-list">
            <div><i class="pi pi-file-pdf" /><span>拼版 PDF/X-4（{{ store.release.binding }}）</span><strong>按放行来源生成</strong></div>
            <div><i class="pi pi-check-circle" /><span>跨页/出血结论</span><strong>{{ store.spreads.length + store.bleeds.length }} 条挂账</strong></div>
            <div><i class="pi pi-check-circle" /><span>色彩控制条报告</span><strong>已包含</strong></div>
            <div><i class="pi pi-check-circle" /><span>打样审批记录（含工艺依据）</span><strong>{{ store.proofs.length }} 轮</strong></div>
            <div><i class="pi pi-check-circle" /><span>纸张与折手规格</span><strong>{{ store.release.binding }}</strong></div>
          </div>
        </section>
        <section class="panel recovery">
          <div class="panel-head"><h3>恢复与失效规则</h3></div>
          <p>分片按 2 页一组写入。写盘失败立即丢弃部分写入，重试时从最后一个哈希通过的完整分片之后续做；工艺/页序调整只作废与受牵连页相交的未完成分片，完整分片照旧复用。旧工艺任务冻结，不会混进新导出包。</p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.resume-note { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; padding: 11px 14px; color: #45676d; font-size: 12px; }
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
.slice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.slice { padding: 9px 10px; border: 1px solid #e6ecec; border-radius: 7px; background: #fafbfb; }
.slice.已完成 { border-color: #b9dcc8; background: #f3faf6; }
.slice.写盘失败 { border-color: #e5bdb2; background: #fdf3f0; }
.slice.写入中 { border-color: #e7d3a6; background: #fdf8ec; }
.slice-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.slice-head strong { font-size: 10px; }
.slice p { margin: 5px 0 3px; color: #6f7d83; font-size: 10px; line-height: 1.45; }
.slice small { color: #8a969b; font-size: 9px; font-family: monospace; }
.frozen { margin: 4px 16px 16px; padding: 12px; border-radius: 8px; background: #f2f4f5; }
.frozen h4 { margin: 0 0 8px; color: #647178; font-size: 11px; }
.frozen h4 i { margin-right: 5px; }
.frozen div { padding: 6px 0; border-top: 1px solid #e4e9ea; }
.frozen strong { font-size: 11px; }
.frozen p { margin: 3px 0 0; color: #7d898e; font-size: 10px; line-height: 1.45; }
aside { display: grid; gap: 14px; }
.package-list { padding: 8px 16px 16px; }
.package-list div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #edf1f1; font-size: 11px; }
.package-list i { color: #397d64; }
.package-list strong { color: #536b72; font-size: 10px; }
.recovery p { padding: 0 16px; color: #67767d; font-size: 11px; line-height: 1.6; }
@media (max-width: 1000px) { .export-grid { grid-template-columns: 1fr; } }
</style>
