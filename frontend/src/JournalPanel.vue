<script setup>
import { computed,onMounted,onUnmounted,reactive,ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from './api';
import { useQuotes } from './use-quotes';
const data=ref({batches:[],ideas:[],trades:[],stats:[],positions:[]}),reports=ref([]),loading=ref(false),error=ref(''),saving=ref(false),section=ref('ideas');
const amounts=reactive({}),dialog=ref(false),selected=ref(null),mode=ref('buy'),form=reactive({}),historyReport=ref(null);
const ids=computed(()=>[...new Set(data.value.ideas.filter(i=>data.value.trades.some(t=>t.ideaId===i.id&&!t.closed)||new Date(i.expiresAt)>new Date()).map(i=>i.assetId))].slice(0,50));
useQuotes(ids);
const latest=computed(()=>reports.value[0]);
const currentBatch=computed(()=>data.value.batches[0]);
const currentIdeas=computed(()=>data.value.ideas.filter(i=>i.batchId===currentBatch.value?.id));
const money=(v,digits=2)=>v==null?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(v);
const signed=v=>v==null?'—':`${v>0?'+':''}${money(v)}`;
const tone=v=>v==null||v===0?'':v>0?'positive':'negative';
const when=v=>new Date(v).toLocaleString('es-ES',{timeZone:'Europe/Madrid'});
const tradeFor=i=>data.value.trades.find(t=>t.ideaId===i.id);
const expired=i=>new Date(i.expiresAt).getTime()<=Date.now();
const state=i=>tradeFor(i)?(tradeFor(i).closed?'Cerrada':'Ejecutada · abierta'):i.decision==='skipped'?'No ejecutada':expired(i)?'Caducada':'Pendiente';
function estimate(i){const amount=amounts[i.id];if(!Number.isFinite(amount)||amount<=0)return null;const units=amount/i.entry;return {quantity:units,profit:units*(i.target-i.entry),loss:units*(i.entry-i.stop)};}
async function refresh(prices=false){loading.value=true;error.value='';try{if(prices)await api('/journal/refresh-quotes',{method:'POST'});const [j,r]=await Promise.all([api('/journal'),api('/reports')]);data.value=j;reports.value=r;}catch(e){error.value=e.message;}finally{loading.value=false;}}
async function choose(i,decision){if(decision==='executed'){openBuy(i);return;}try{await api(`/journal/ideas/${i.id}/decision`,{method:'PUT',body:JSON.stringify({decision})});await refresh();}catch(e){ElMessage.error(e.message);}}
function openBuy(i){selected.value=i;mode.value='buy';Object.assign(form,{requestKey:crypto.randomUUID(),amount:amounts[i.id]??null,price:i.entry,fee:0,executedAt:new Date()});dialog.value=true;}
function openSale(t){selected.value=t;mode.value='sell';Object.assign(form,{requestKey:crypto.randomUUID(),quantity:t.remaining,price:null,fee:0,executedAt:new Date()});dialog.value=true;}
async function save(){saving.value=true;try{const body={requestKey:form.requestKey,price:form.price,fee:form.fee,executedAt:form.executedAt?new Date(form.executedAt).toISOString():null};body[mode.value==='buy'?'amount':'quantity']=mode.value==='buy'?form.amount:form.quantity;await api(mode.value==='buy'?`/journal/ideas/${selected.value.id}/buy`:`/journal/trades/${selected.value.id}/sell`,{method:'POST',body:JSON.stringify(body)});dialog.value=false;await refresh();ElMessage.success('Ejecución guardada en el diario local.');}catch(e){ElMessage.error(e.message);}finally{saving.value=false;}}
let timer;
onMounted(()=>{void refresh(true);timer=setInterval(()=>{if(!document.hidden&&!dialog.value&&!loading.value)void refresh();},60000);});
onUnmounted(()=>clearInterval(timer));
</script>

<template>
  <div class="toolbar"><div><h2>Tu actividad de inversión</h2><span class="muted">Lunes a viernes, excepto festivos bursátiles. NYSE: propuestas al abrir (09:30) · Resumen al cerrar (16:00; 13:00 en sesiones reducidas) · Hora de Nueva York</span></div><el-button :loading="loading" @click="refresh(true)">Actualizar panel y precios</el-button></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="notice"/>
  <p class="footnote" v-if="data.asOf">Panel consultado: {{ when(data.asOf) }}. Las monedas se contabilizan por separado. Las ejecuciones se registran manualmente.</p>
  <section class="summary-grid" aria-label="Estadísticas por estrategia y moneda">
    <article v-for="s in data.stats" :key="`${s.strategy}-${s.currency}`" class="summary">
      <p class="eyebrow">{{ s.strategy==='swing'?'SWING TRADING':'LARGO PLAZO' }} · {{ s.currency }}</p>
      <h2 :class="tone(s.unrealized)">{{ signed(s.unrealized) }} <small>{{ s.currency }}</small></h2><p>Resultado abierto {{ s.missing?'(parcial)':'' }}</p>
      <p>Capital abierto: {{ money(s.cost) }} {{ s.currency }}</p>
      <div class="summary-bottom"><span :class="tone(s.realized)">{{ signed(s.realized) }} {{ s.currency }}</span><small>{{ s.strategy==='swing'?'Resultado realizado, descontando comisiones registradas':'Ventas de largo plazo aún no registradas' }}</small></div>
      <p v-if="s.strategy==='swing'">Total realizado + abierto: <b :class="tone(s.total)">{{ signed(s.total) }} {{ s.currency }}</b></p>
      <p>{{ s.open }} abiertas · {{ s.closed }} cerradas</p><p v-if="s.strategy==='swing'">Acierto: {{ money(s.winRate) }} % · {{ s.wins }} ganadoras / {{ s.losses }} perdedoras</p>
      <p v-if="s.missing" class="missing">{{ s.missing }} posiciones sin cotización vigente. El total no está disponible.</p>
    </article>
    <article class="summary"><p class="eyebrow">DIARIO DE SWING</p><h2>{{ data.trades.filter(t=>!t.closed).length }} <small>operaciones abiertas</small></h2><p>{{ currentIdeas.length }} propuestas en el último análisis</p><p>{{ data.ideas.filter(i=>i.decision==='skipped'&&!tradeFor(i)).length }} descartadas en los análisis cargados</p><p>Beneficios previstos y operaciones no ejecutadas no cuentan como ganancias.</p></article>
  </section>
  <section class="panel daily-report" aria-label="Último informe diario">
    <p class="eyebrow">ÚLTIMO INFORME DIARIO</p>
    <template v-if="latest"><h2>{{ latest.title }}</h2><p class="muted">Guardado: {{ when(latest.createdAt) }} · Día {{ latest.day }}</p><p class="report-prose">{{ latest.summary }}</p>
      <h3>Estado de la cartera y las órdenes</h3><ul><li v-for="line in latest.observations" :key="line">{{ line }}</li></ul>
      <h3>Aspectos a revisar</h3><ul><li v-for="line in latest.suggestions" :key="line">{{ line }}</li></ul>
      <p class="footnote">Este informe conserva los datos del momento en que se generó. El panel superior se consulta por separado.</p>
      <div class="source-links"><a v-for="source in latest.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a></div>
    </template><el-empty v-else description="El primer resumen aparecerá aquí cuando se ejecute la tarea diaria." :image-size="60"/>
  </section>
  <el-tabs v-model="section" class="journal-tabs">
    <el-tab-pane label="Propuestas de swing" name="ideas">
      <section class="panel"><h2>Hasta 3 oportunidades justificadas</h2><p class="muted">Compra spot, sin apalancamiento. Cada propuesta incluye mercado, niveles, fuentes y caducidad. No se envían órdenes al bróker.</p>
        <template v-if="currentBatch"><p><b>Análisis del {{ currentBatch.day }}</b> · {{ when(currentBatch.createdAt) }}</p><p class="report-prose">{{ currentBatch.summary }}</p><div class="source-links"><a v-for="s in currentBatch.sources" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a></div></template>
        <el-empty v-if="!currentIdeas.length" :description="currentBatch?'No se publicaron oportunidades con datos y condiciones suficientes.':'Todavía no hay un análisis diario guardado.'" :image-size="70"/>
        <article v-for="i in currentIdeas" :key="i.id" class="plan">
          <div class="section-heading"><div><h3>{{ i.symbol }} · {{ i.name }}</h3><p class="muted">{{ i.exchange }} · {{ i.currency }}</p></div><el-tag :type="expired(i)&&!tradeFor(i)?'warning':'info'">{{ state(i) }}</el-tag></div>
          <div class="levels"><div>Compra limitada<strong>{{ money(i.entry,8) }}</strong></div><div>Venta objetivo<strong class="positive">{{ money(i.target,8) }}</strong></div><div>Stop-loss<strong class="negative">{{ money(i.stop,8) }}</strong></div></div>
          <p class="report-prose">{{ i.rationale }}</p><p><b>Invalidación:</b> {{ i.invalidation }}</p><p class="footnote">Datos de mercado: {{ when(i.sourceAt) }} · Válida hasta {{ when(i.expiresAt) }}</p>
          <div class="source-links"><a v-for="s in i.sources" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a></div>
          <el-form label-position="top"><div class="form-grid"><el-form-item :label="`Importe que quieres invertir (${i.currency})`"><el-input-number v-model="amounts[i.id]" :controls="false" :min="0" :max="1e12"/></el-form-item>
          <el-form-item label="¿La ejecutaste?" v-if="!tradeFor(i)"><el-select :model-value="i.decision" @change="value=>choose(i,value)"><el-option label="Pendiente / sin ejecutar" value="pending"/><el-option label="No ejecutada / descartada" value="skipped"/><el-option label="Sí, registrar compra realizada" value="executed"/></el-select></el-form-item></div></el-form>
          <div v-if="estimate(i)" class="calculation-result"><p>Cantidad estimada <b>{{ money(estimate(i).quantity,12) }}</b></p><p>Ganancia objetivo <b class="positive">+{{ money(estimate(i).profit) }} {{ i.currency }}</b></p><p>Pérdida al stop <b class="negative">−{{ money(estimate(i).loss) }} {{ i.currency }}</b></p><p>Beneficio / riesgo <b>{{ money((i.target-i.entry)/(i.entry-i.stop)) }} : 1</b></p></div>
          <p class="footnote">Estimaciones sin comisiones ni deslizamiento. El stop no garantiza el precio. Una cotización que toque un nivel no confirma una ejecución.</p>
        </article>
      </section>
    </el-tab-pane>
    <el-tab-pane label="Mis ejecuciones" name="trades"><section class="panel"><h2>Compras y ventas confirmadas</h2><el-empty v-if="!data.trades.length" description="Registra una compra ejecutada desde una propuesta para iniciar tus estadísticas." :image-size="70"/>
      <article v-for="t in data.trades" :key="t.id" class="plan"><div class="section-heading"><h3>{{ t.idea.symbol }} · {{ t.idea.currency }}</h3><el-tag>{{ t.closed?'Cerrada':'Abierta' }}</el-tag></div><p>Compraste {{ money(t.quantity,12) }} a {{ money(t.price,8) }} el {{ when(t.executedAt) }}.</p><p>Coste de compra: {{ money(t.quantity*t.price) }} · Comisión de compra: {{ money(t.fee,8) }} {{ t.idea.currency }}</p><p>Quedan: {{ money(t.remaining,12) }} · Vendidas: {{ money(t.sold,12) }}</p><p>Realizado: <b :class="tone(t.realized)">{{ signed(t.realized) }} {{ t.idea.currency }}</b> · Abierto: <b :class="tone(t.unrealized)">{{ signed(t.unrealized) }} {{ t.idea.currency }}</b></p><el-button v-if="!t.closed" @click="openSale(t)">Registrar venta realizada</el-button><ul><li v-for="s in t.sales" :key="s.id">{{ when(s.executedAt) }}: {{ money(s.quantity,12) }} a {{ money(s.price,8) }} · Comisión {{ money(s.fee,8) }} {{ t.idea.currency }}</li></ul></article>
    </section></el-tab-pane>
    <el-tab-pane label="Historial" name="history"><section class="panel"><h2>Informes guardados</h2><el-table :data="reports" empty-text="Sin informes todavía"><el-table-column prop="day" label="Día" width="130"/><el-table-column prop="title" label="Informe"/><el-table-column label="Abrir" width="90"><template #default="{row}"><el-button link type="primary" @click="historyReport=row">Ver</el-button></template></el-table-column></el-table><h3>Análisis anteriores</h3><article v-for="b in data.batches" :key="b.id" class="plan"><b>{{ b.day }}</b><p>{{ b.summary }}</p><div v-for="i in data.ideas.filter(i=>i.batchId===b.id)" :key="i.id" class="history-idea"><span>{{ i.symbol }} · {{ state(i) }} · Entrada {{ money(i.entry,8) }} / Venta {{ money(i.target,8) }} / Stop {{ money(i.stop,8) }} {{ i.currency }}</span><el-button v-if="!tradeFor(i)" size="small" @click="openBuy(i)">Registrar compra realizada durante su vigencia</el-button></div></article><p class="footnote">Se muestran los últimos 30 análisis y 90 informes. El histórico completo permanece en PostgreSQL.</p></section></el-tab-pane>
  </el-tabs>
  <el-dialog v-model="dialog" :title="mode==='buy'?'Registrar compra ejecutada':'Registrar venta ejecutada'" width="560px" :close-on-click-modal="false">
    <p>Introduce lo que ejecutaste realmente en tu bróker. Este registro actualizará tus estadísticas.</p>
    <el-form label-position="top" @submit.prevent="save"><el-form-item v-if="mode==='buy'" :label="`Importe comprado, sin comisión (${selected?.currency})`"><el-input-number v-model="form.amount" :controls="false" :min="0" :max="1e12"/></el-form-item><el-form-item v-else label="Cantidad vendida"><el-input-number v-model="form.quantity" :controls="false" :min="0" :max="selected?.remaining"/></el-form-item><el-form-item label="Precio real de ejecución"><el-input-number v-model="form.price" :controls="false" :min="0" :max="1e12"/></el-form-item><el-form-item label="Comisión pagada en la moneda de la operación"><el-input-number v-model="form.fee" :controls="false" :min="0" :max="1e12"/></el-form-item><el-form-item label="Fecha y hora real (hora local del navegador)"><el-date-picker v-model="form.executedAt" type="datetime"/></el-form-item><p class="footnote">Usa el precio medio si agrupas varias ejecuciones de una compra. Las ventas pueden registrarse por separado.</p><div class="dialog-actions"><el-button @click="dialog=false">Cancelar</el-button><el-button native-type="submit" type="primary" :loading="saving">Guardar ejecución</el-button></div></el-form>
  </el-dialog>
  <el-dialog :model-value="!!historyReport" @close="historyReport=null" :title="historyReport?.title" width="720px"><template v-if="historyReport"><p>{{ when(historyReport.createdAt) }}</p><p class="report-prose">{{ historyReport.summary }}</p><ul><li v-for="x in [...historyReport.observations,...historyReport.suggestions]" :key="x">{{ x }}</li></ul><div class="source-links"><a v-for="s in historyReport.sources" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a></div></template></el-dialog>
</template>

<style scoped>
.daily-report{margin:24px 0}.daily-report h3{font-size:17px;margin-top:20px}.daily-report li{line-height:1.65;margin:8px 0}.report-prose{white-space:pre-wrap;line-height:1.7;overflow-wrap:anywhere}.source-links{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;font-size:13px}.source-links a{color:#176c53}.history-idea{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:14px 0}.journal-tabs{margin-top:24px}.plan .el-form{margin-top:20px}
</style>
