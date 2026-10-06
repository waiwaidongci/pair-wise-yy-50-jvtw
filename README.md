# 印刷拼版预检与打样轮次审批平台

面向印刷生产团队的拼版工作台，支持页面尺寸与印刷规格、Canvas 版位编辑、出血/安全区/折手/页码检查、打样反馈、版本并排对比、审批锁定和可恢复导出任务。

## 技术栈

Vue 3 + PrimeVue + Pinia + Vue Router + TanStack Query + Axios + Canvas + Vite + TypeScript

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:62050`。

## 核心工作流

- 导入页面尺寸、出血、安全区、折手和装订方向，在 Canvas 中拖拽版位。
- 自动检查页面缺失、出血不足、页序冲突、版位重叠和装订错误。
- 每轮打样记录样张照片、色差反馈、修正说明和负责人决定。
- 版本并排对比、审批锁定，并恢复中断的导出任务。

## 放行台账（单一放行来源）

装订工艺、拼版版本、折手跨页结论、订口出血结论、打样工艺依据和交付分片统一挂在
`src/domain/ledger.ts` 的 Release 台账上，Pinia store 与模拟 REST 适配器（`src/api/exportApi.ts`）
共用同一份来源，不再各自保存骑马订时代的旧数据。

- **工艺切换（如临时改胶装）**：新建 Release。按折手签名比对跨页——签名相同（如剧照 4-5
  在两种工艺下同为「书心对页」）的结论照旧沿用；签名变化或不再套合（如封面 8-1）的结论
  失效待重算或作废。订口出血规则随工艺变化（骑马订 3mm / 胶装 2mm），全部订口结论重算。
- **页序调整**：只让包含被调整页的跨页、这两页的出血结论以及与它们相交的未完成分片失效，
  无关页面与已完成（哈希通过）分片照旧。
- **旧稿待复核**：打样记录缺 `bindingBasis` 或依据工艺与当前 Release 不符时标记
  「工艺依据缺失/不符待复核」，Release 保持「待复核」，人工复核补齐后才可放行。
- **并发确认**：放行确认带 `version` 乐观锁，先到者占用，后到者在「并发确认差异留痕」中
  留存双方提交与字段差异，不覆盖先到结论。
- **分片续做**：写盘失败丢弃部分写入，从最后一个哈希通过的完整分片之后续做；resume 带
  幂等键，同一请求重试只复用首次结果；交付包按 Release 幂等创建，重试不追加任务。
  被新工艺替代的旧任务冻结，不会混进新导出包。

## 领域规则验证

`/tmp/ledger-test/domain.test.ts` 用 esbuild 打包后在 Node 下直接验证上述规则：

```bash
cd /tmp/ledger-test
npx esbuild domain.test.ts --bundle --platform=node --format=esm --outfile=domain.test.mjs
node domain.test.mjs
```
