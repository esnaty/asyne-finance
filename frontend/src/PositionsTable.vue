<script setup>
import { ref } from 'vue';
import { currentOutcome,positionOutcome } from './position-outcome';
defineProps({positions:{type:Array,required:true}});
defineEmits(['edit','remove']);
const expanded=ref(new Set());
function toggle(id){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next;}
const number=(v,digits=2)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(v);
const date=v=>v?new Date(v).toLocaleString('es-ES'):'—';
const money=(v,c)=>v==null?'—':`${number(v)} ${c}`;
const signed=(v,c)=>v==null?'—':`${v>0?'+':''}${money(v,c)}`;
const outcome=p=>positionOutcome(p,p.amount==null?'quantity':'amount');
</script>

<template>
  <table class="positions-table" aria-label="Tus posiciones">
    <thead><tr><th>Activo</th><th>Invertido</th><th>Valor actual</th><th>Ganancia / pérdida</th><th><span class="sr-only">Detalle</span></th></tr></thead>
    <tbody>
      <template v-for="row in positions" :key="row.id">
        <tr class="position-summary">
          <td class="asset-cell"><strong>{{ row.symbol }}</strong><small>{{ row.strategy==='swing'?'Swing':'Largo plazo' }}<template v-if="row.importSource?.broker"> · {{ row.importSource.broker }}</template></small></td>
          <td data-label="Invertido"><b>{{ money(row.quantity*row.averagePrice,row.currency) }}</b><small>{{ number(row.quantity,12) }} unidades</small></td>
          <td data-label="Valor actual"><b>{{ money(row.currentPrice==null?null:row.quantity*row.currentPrice,row.currency) }}</b><small>{{ row.currentPrice==null?(row.priceLabel||'Sin cotización disponible'):row.quote?.status==='closed'?'Mercado cerrado':'Según última cotización' }}</small></td>
          <td data-label="Ganancia / pérdida"><template v-if="currentOutcome(row)"><b :class="currentOutcome(row).profit>0?'positive':currentOutcome(row).profit<0?'negative':''">{{ signed(currentOutcome(row).profit,row.currency) }}</b><small :class="currentOutcome(row).profit>0?'positive':currentOutcome(row).profit<0?'negative':''">{{ currentOutcome(row).percent>0?'+':'' }}{{ number(currentOutcome(row).percent) }} %</small></template><template v-else><b>—</b><small>Sin precio para calcular</small></template></td>
          <td class="detail-toggle"><el-button link type="primary" :aria-expanded="expanded.has(row.id)" :aria-controls="`position-detail-${row.id}`" :aria-label="`${expanded.has(row.id)?'Ocultar':'Ver'} detalle de ${row.symbol}`" @click="toggle(row.id)">{{ expanded.has(row.id)?'Cerrar':'Detalles' }} <span aria-hidden="true">{{ expanded.has(row.id)?'−':'+' }}</span></el-button></td>
        </tr>
        <tr v-if="expanded.has(row.id)" class="position-detail"><td colspan="5" :id="`position-detail-${row.id}`">
          <div class="detail-heading"><strong>{{ row.importSource?.name||row.asset?.name||row.symbol }}</strong><div><el-button size="small" @click="$emit('edit',row)">Editar</el-button><el-button size="small" type="danger" plain @click="$emit('remove',row)">Eliminar</el-button></div></div>
          <div class="position-detail-grid">
            <section><h4>Posición y cotización</h4><dl><dt>Cantidad</dt><dd>{{ number(row.quantity,12) }}</dd><dt>Precio medio</dt><dd>{{ number(row.averagePrice,8) }} {{ row.currency }}</dd><dt>Precio actual</dt><dd>{{ row.currentPrice==null?'—':`${number(row.currentPrice,8)} ${row.currency}` }}</dd></dl><p>{{ row.priceLabel }}</p><p v-if="row.quote?.asOf">{{ row.quote.source }} · {{ date(row.quote.asOf) }}</p></section>
            <section><h4>Salidas pendientes</h4><ul v-if="row.exits?.length"><li v-for="(exit,index) in row.exits" :key="index">{{ number(exit.quantity,12) }} a <b>{{ number(exit.targetPrice,8) }} {{ row.currency }}</b></li></ul><p v-else>Objetivo: {{ row.targetPrice==null?'Sin definir':`${number(row.targetPrice,8)} ${row.currency}` }}</p><p>Stop-loss: {{ row.stopLoss==null?'Sin definir':`${number(row.stopLoss,8)} ${row.currency}` }}</p><p v-if="row.exits?.length">Sin salida asignada: {{ number(outcome(row)?.remaining,12) }} unidades.</p></section>
            <section><h4>Resultado potencial</h4><dl><dt>Ganancia objetivo</dt><dd class="positive">{{ signed(outcome(row)?.profit,row.currency) }}</dd><dt>Pérdida al stop</dt><dd class="negative">{{ outcome(row)?.loss==null?'—':`−${money(outcome(row).loss,row.currency)}` }}</dd></dl><p>Estimaciones sin comisiones. Las salidas pendientes no se descuentan de la cantidad actual.</p></section>
          </div>
          <details v-if="row.importSource" class="position-source"><summary>Origen de los datos</summary><p>{{ row.importSource.file }} · {{ row.importSource.sheet }}!{{ row.importSource.range }}</p><p>Coste registrado: {{ number(row.importSource.costUsd,8) }} USD. Precio de referencia del Excel: {{ number(row.importSource.snapshotPriceUsd,8) }} USD, sin fecha de cotización.</p><p>{{ row.importSource.notes }}</p></details>
          <p class="updated-note">Registro actualizado: {{ date(row.updatedAt) }}</p>
        </td></tr>
      </template>
      <tr v-if="!positions.length"><td colspan="5" class="empty-positions">Todavía no hay posiciones en esta vista.</td></tr>
    </tbody>
  </table>
  <p v-if="positions.length" class="footnote">Resultado actual sin realizar y sin comisiones. Abre «Detalles» para ver precios, salidas, stop-loss y editar la posición.</p>
</template>

<style scoped>
.positions-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;text-align:left}.positions-table th{background:#f5f7fa;color:#637589;font-size:12px;font-weight:600;padding:14px 12px}.positions-table th:first-child{width:22%}.positions-table th:last-child{width:90px}.positions-table td{padding:18px 12px;vertical-align:middle;overflow-wrap:anywhere}.position-summary{border-bottom:1px solid #e8edf2}.position-summary:hover{background:#fafcfb}.position-summary b{font-weight:600;font-variant-numeric:tabular-nums}.position-summary small{display:block;font-size:12px;color:#738194;margin-top:5px;line-height:1.5}.position-summary .positive{color:#167657}.position-summary .negative{color:#b63445}.asset-cell strong{font-size:16px;color:#17283c}.detail-toggle{text-align:right}.detail-toggle span{margin-left:7px}.position-detail>td{background:#f7faf9;padding:22px;border-bottom:1px solid #dce5e1}.detail-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.detail-heading>div{display:flex;gap:8px}.position-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:20px}.position-detail-grid h4{margin:0 0 12px;font-size:13px;color:#405469}.position-detail-grid p,.position-source p,.updated-note{font-size:12px;line-height:1.65;color:#6a788a;margin:8px 0}.position-detail-grid dl{margin:0;font-size:13px}.position-detail-grid dt{color:#6a788a;margin-top:10px}.position-detail-grid dd{margin:3px 0 0;font-variant-numeric:tabular-nums}.position-detail-grid ul{padding-left:16px;line-height:1.8;font-size:13px}.position-source{margin-top:18px;font-size:12px;border-top:1px solid #dde7e1;padding-top:14px}.position-source summary{cursor:pointer;color:#176c53}.updated-note{margin-top:16px}.empty-positions{text-align:center;color:#738194}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:900px){.position-detail-grid{grid-template-columns:1fr 1fr}.positions-table td,.positions-table th{padding:14px 8px}}
@media(max-width:640px){.positions-table,.positions-table tbody{display:block}.positions-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.position-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 12px;padding:18px 0}.positions-table .position-summary td{display:block;padding:0}.asset-cell{grid-column:1;grid-row:1}.detail-toggle{grid-column:2;grid-row:1;align-self:center}.position-summary td[data-label]::before{content:attr(data-label);display:block;color:#6a788a;font-size:11px;margin-bottom:6px}.position-detail,.position-detail>td{display:block;width:100%;box-sizing:border-box}.position-detail>td{padding:16px}.position-detail-grid{grid-template-columns:1fr;gap:16px}.detail-heading{align-items:flex-start}.empty-positions{display:block}}
</style>
