<script setup>
import { computed,onMounted,reactive,ref,watch } from 'vue';
import { ElMessage,ElMessageBox } from 'element-plus';
import { api } from './api';
import JournalPanel from './JournalPanel.vue';
import PositionsTable from './PositionsTable.vue';
import { useQuotes,quoteUsable,quoteLabel } from './use-quotes';
import { positionOutcome,currentOutcome } from './position-outcome';
const tab=ref('home'),positions=ref([]),plans=ref([]),loading=ref(true),loadError=ref(''),saving=ref(false),positionDialog=ref(false),planDialog=ref(false),editingId=ref(null),strategy=ref('all');
const position=reactive({}),plan=reactive({}),positionMode=ref('amount');
const assets=ref([]),assetMap=reactive({}),assetKind=ref('all'),assetLoading=ref(false),catalogError=ref(''),catalogSyncing=ref(false),marketStatus=ref({twelveConfigured:false,counts:[]});
let searchSerial=0;
const selectedAsset=computed(()=>assetMap[position.assetId]||null);
const selectorAssets=computed(()=>selectedAsset.value&&!assets.value.some(a=>a.id===selectedAsset.value.id)?[selectedAsset.value,...assets.value]:assets.value);
const quoteIds=computed(()=>[...new Set([...positions.value.map(p=>p.assetId),positionDialog.value?position.assetId:null].filter(Boolean))].sort());
const {quotes,clock}=useQuotes(quoteIds);
const selectedQuote=computed(()=>quotes.value[position.assetId]);
const pricedPositions=computed(()=>positions.value.map(p=>{
 if(!p.assetId)return {...p,priceLabel:p.importSource?'Importado · cotización pendiente de asociar':'Precio manual anterior',quote:null};
 const quote=quotes.value[p.assetId]||p.quote;
 return {...p,currentPrice:quoteUsable(quote,clock.value)?quote.price:null,quote,priceLabel:quoteLabel(quote,clock.value)};
}));
function assetLabel(a){return `${a.symbol} · ${a.name} · ${a.exchange}${a.mic?` (${a.mic})`:''} · ${a.currency}`;}
async function searchAssets(q=''){
 const serial=++searchSerial;assetLoading.value=true;
 try{const rows=await api(`/assets?q=${encodeURIComponent(q)}&kind=${assetKind.value}`);if(serial!==searchSerial)return;assets.value=rows;for(const a of rows)assetMap[a.id]=a;catalogError.value='';}
 catch(e){if(serial===searchSerial)catalogError.value=e.message;}
 finally{if(serial===searchSerial)assetLoading.value=false;}
}
async function syncAssets(){
 catalogSyncing.value=true;catalogError.value='';
 try{const results=await api('/assets/sync',{method:'POST'});marketStatus.value=await api('/market/status');await searchAssets();const errors=results.filter(r=>!r.ok);if(errors.length)catalogError.value=errors.map(r=>`${r.source}: ${r.error}`).join(' · ');else ElMessage.success('Catálogo actualizado en PostgreSQL.');}
 catch(e){catalogError.value=e.message;}finally{catalogSyncing.value=false;}
}
async function loadCatalog(){try{marketStatus.value=await api('/market/status');if(!marketStatus.value.counts.length)await syncAssets();else await searchAssets();}catch(e){catalogError.value=e.message;}}
function selectAsset(id){
 const a=assetMap[id];if(!a)return;
 if(position.currency!==a.currency)position.amount=null;
 Object.assign(position,{symbol:a.symbol.toUpperCase(),currency:a.currency,averagePrice:null,targetPrice:null,exits:[],stopLoss:null,quantity:null,currentPrice:null});
}
const outcome=computed(()=>positionOutcome(position,positionMode.value));
const positionLevelError=computed(()=>{
  if(position.exits?.some(e=>!Number.isFinite(e.quantity)||e.quantity<=0||!Number.isFinite(e.targetPrice)||e.targetPrice<=position.averagePrice))return 'Cada salida necesita una cantidad positiva y un precio superior a la entrada.';
  if(outcome.value&&position.exits?.reduce((n,e)=>n+(e.quantity||0),0)>outcome.value.quantity*(1+Number.EPSILON*4))return 'Las salidas superan la cantidad de la posición.';
  if(position.targetPrice!=null&&(!Number.isFinite(position.targetPrice)||position.targetPrice<=position.averagePrice))return 'La salida objetivo debe superar la entrada.';
  if(position.stopLoss!=null&&(!Number.isFinite(position.stopLoss)||position.stopLoss<=0||position.stopLoss>=position.averagePrice))return 'El stop-loss debe ser positivo e inferior a la entrada.';
  return '';
});
function changePositionMode(mode){
  const previous=positionOutcome(position,mode==='amount'?'quantity':'amount');
  if(previous){position.amount=previous.amount;position.quantity=previous.quantity;}
}
function rowOutcome(row){return positionOutcome(row,row.amount==null?'quantity':'amount');}
const calculation=reactive({capital:60,risk:1,entry:100,stop:97,target:106,fee:.1});
const result=ref(null),calculationError=ref(''),calculating=ref(false);
const currencies=['USD','EUR','USDT'];
const strategyNames={long_term:'Largo plazo',swing:'Swing'};
const statusNames={draft:'Borrador',watching:'En seguimiento',invalidated:'Invalidado',archived:'Archivado'};
const filteredPositions=computed(()=>pricedPositions.value.filter(p=>strategy.value==='all'||p.strategy===strategy.value));
const totals=computed(()=>currencies.map(currency=>{const rows=filteredPositions.value.filter(p=>p.currency===currency);const priced=rows.filter(p=>p.currentPrice!==null);return{currency,count:rows.length,missing:rows.length-priced.length,cost:rows.reduce((sum,p)=>sum+p.quantity*p.averagePrice,0),value:priced.reduce((sum,p)=>sum+p.quantity*p.currentPrice,0),profit:priced.reduce((sum,p)=>sum+p.quantity*(p.currentPrice-p.averagePrice),0)};}).filter(t=>t.count));
const activePlans=computed(()=>plans.value.filter(p=>['draft','watching'].includes(p.status)&&!expired(p)).length);
function number(value,digits=2){return new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(value);}
function date(value){return value?new Date(value).toLocaleString('es-ES'):'Sin caducidad';}
function expired(p){return p.expiresAt&&new Date(p.expiresAt).getTime()<=Date.now();}
async function refresh(){loading.value=true;loadError.value='';try{const [p,s]=await Promise.all([api('/positions'),api('/plans')]);positions.value=p;plans.value=s;for(const row of p)if(row.asset)assetMap[row.assetId]=row.asset;}catch(e){loadError.value=e.message;}finally{loading.value=false;}}
function editPosition(p){
  editingId.value=p?.id||null;
  positionMode.value=p&&p.amount==null?'quantity':'amount';
  Object.assign(position,p?{assetId:p.assetId??null,symbol:p.symbol,quantity:p.quantity,amount:p.amount??p.quantity*p.averagePrice,averagePrice:p.averagePrice,targetPrice:p.targetPrice??null,exits:(p.exits||[]).map(e=>({...e})),stopLoss:p.stopLoss??null,currentPrice:p.currentPrice,currency:p.currency,strategy:p.strategy}:{assetId:null,symbol:'',quantity:null,amount:null,averagePrice:null,targetPrice:null,exits:[],stopLoss:null,currentPrice:null,currency:'USD',strategy:'long_term'});
  positionDialog.value=true;
}
async function savePosition(){saving.value=true;try{if(!position.assetId&&!editingId.value)throw new Error('Selecciona un activo del catálogo.');if(!outcome.value||positionLevelError.value)throw new Error(positionLevelError.value||'Introduce un monto o cantidad y una entrada válidos.');const body={...position,targetPrice:position.targetPrice??null,stopLoss:position.stopLoss??null,currentPrice:null};delete body[positionMode.value==='amount'?'quantity':'amount'];await api(editingId.value?`/positions/${editingId.value}`:'/positions',{method:editingId.value?'PUT':'POST',body:JSON.stringify(body)});positionDialog.value=false;await refresh();ElMessage.success('Posición guardada en PostgreSQL.');}catch(e){ElMessage.error(e.message);}finally{saving.value=false;}}
function editPlan(p){editingId.value=p?.id||null;Object.assign(plan,p?{symbol:p.symbol,market:p.market,currency:p.currency,entry:p.entry,stop:p.stop,target:p.target,notes:p.notes,expiresAt:p.expiresAt,status:p.status}:{symbol:'',market:'',currency:'USDT',entry:100,stop:97,target:106,notes:'',expiresAt:null,status:'draft'});planDialog.value=true;}
async function savePlan(){saving.value=true;try{const body={...plan,expiresAt:plan.expiresAt?new Date(plan.expiresAt).toISOString():null};await api(editingId.value?`/plans/${editingId.value}`:'/plans',{method:editingId.value?'PUT':'POST',body:JSON.stringify(body)});planDialog.value=false;await refresh();ElMessage.success('Plan guardado.');}catch(e){ElMessage.error(e.message);}finally{saving.value=false;}}
async function remove(kind,item){try{await ElMessageBox.confirm(`Se eliminará ${item.symbol} de ${kind==='positions'?'tu cartera':'tus planes'}.`,'Eliminar registro',{type:'warning',confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'});}catch{return;}try{await api(`/${kind}/${item.id}`,{method:'DELETE'});await refresh();ElMessage.success('Registro eliminado.');}catch(e){ElMessage.error(e.message);}}
async function calculate(){calculating.value=true;calculationError.value='';result.value=null;try{result.value=await api('/calculate',{method:'POST',body:JSON.stringify(calculation)});}catch(e){calculationError.value=e.message;}finally{calculating.value=false;}}
function usePlan(p){Object.assign(calculation,{entry:p.entry,stop:p.stop,target:p.target});result.value=null;ElMessage.info(`Niveles de ${p.symbol} cargados. Introduce el capital en ${p.currency}.`);}
watch(calculation,()=>{result.value=null;calculationError.value='';});
onMounted(()=>{void refresh();void loadCatalog();});
</script>

<template>
  <el-config-provider size="large">
    <header class="topbar"><a class="brand" href="/"><span class="brand-mark">A</span> ASYNE <span>FINANCE</span></a><el-tag type="info" effect="plain">Entorno local · registro manual</el-tag></header>
    <main>
      <div class="page-heading"><div><p class="eyebrow">TU ESPACIO DE INVERSIÓN</p><h1>Tu capital, en perspectiva<span>.</span></h1><p>Cartera a largo plazo y planes de swing trading.</p></div><el-button :loading="loading" @click="refresh">Actualizar registros</el-button></div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="notice"><template #default>No se han podido cargar los registros. Comprueba los contenedores y pulsa «Actualizar registros».</template></el-alert>
      <div class="market-toolbar"><span>Catálogo: {{ marketStatus.counts.reduce((n,r)=>n+r.count,0) }} activos</span><el-button size="small" :loading="catalogSyncing" @click="syncAssets">Actualizar catálogo</el-button></div>
      <el-alert v-if="catalogError" :title="catalogError" type="warning" :closable="false" class="notice"/>
      <el-alert v-if="!marketStatus.twelveConfigured" title="Acciones y ETF: falta la clave gratuita de Twelve Data" type="info" :closable="false" class="notice"><template #default>El selector ya incluye activos de bolsa. Para consultar sus precios, configura TWELVE_DATA_API_KEY en el archivo local .env. Cripto funciona sin clave. <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener noreferrer">Ver plan gratuito</a></template></el-alert>
      <el-alert v-if="quoteIds.length>50" title="Se actualizan los primeros 50 activos distintos. El resto no se incluye en la valoración vigente." type="warning" :closable="false"/>
      <el-tabs v-model="tab">
        <el-tab-pane label="Inicio y swing diario" name="home"><JournalPanel v-if="tab==='home'"/></el-tab-pane>
        <el-tab-pane label="Mi cartera" name="portfolio">
          <div class="toolbar"><el-radio-group v-model="strategy" aria-label="Estrategia de inversión"><el-radio-button value="all">Todas</el-radio-button><el-radio-button value="long_term">Largo plazo</el-radio-button><el-radio-button value="swing">Swing</el-radio-button></el-radio-group><el-button type="primary" :disabled="!!loadError||loading" @click="editPosition()">Añadir posición</el-button></div>
          <section v-if="totals.length" class="summary-grid" aria-label="Resumen por moneda"><article v-for="total in totals" :key="total.currency" class="summary"><p class="eyebrow">VALORACIÓN · {{ total.currency }}</p><h2>{{ total.missing===total.count?'—':number(total.value) }} <small>{{ total.currency }}</small></h2><p>Coste total: {{ number(total.cost) }} {{ total.currency }}</p><div class="summary-bottom"><span :class="total.profit>=0?'positive':'negative'">{{ total.missing===total.count?'—':`${total.profit>=0?'+':''}${number(total.profit)}` }} {{ total.currency }}</span><small>Resultado de posiciones valoradas</small></div><p v-if="total.missing" class="missing">Valoración parcial: {{ total.missing }} posición(es) sin precio.</p></article></section>
          <section class="panel" v-loading="loading"><div class="section-heading"><div><p class="eyebrow">01 / CARTERA</p><h2>Tus posiciones</h2></div><el-tag type="info">{{ filteredPositions.length }} registros</el-tag></div><p class="muted">Cripto en directo; bolsa según cobertura y clave configurada. Las monedas se muestran por separado, sin conversión.</p>
            <PositionsTable :positions="filteredPositions" @edit="editPosition" @remove="row=>remove('positions',row)"/><div v-if="!positions.length&&!loading&&!loadError" class="empty-help"><b>Empieza por tu primera posición</b><p>Registra el activo, la cantidad y el precio medio de compra. Podrás actualizarlo cuando quieras.</p></div>
          </section>
        </el-tab-pane>
        <el-tab-pane label="Monitor swing" name="trading">
          <div class="toolbar"><div><el-tag type="info">{{ activePlans }} planes sin caducar</el-tag><span class="toolbar-hint">Sin conexión a datos de mercado</span></div><el-button type="primary" :disabled="!!loadError||loading" @click="editPlan()">Crear plan</el-button></div>
          <div class="trading-grid"><section class="panel" v-loading="loading"><p class="eyebrow">02 / PLANES DE TRADING</p><h2>Una estrategia antes de entrar</h2><p class="muted">Planes manuales. No son señales generadas ni órdenes enviadas al broker.</p><el-empty v-if="!plans.length&&!loading" description="Todavía no hay planes de trading" :image-size="95"/>
            <article v-for="p in plans" :key="p.id" class="plan"><div class="section-heading"><div><h3>{{ p.symbol }}</h3><p class="muted">{{ p.market }} · {{ p.currency }}</p></div><el-tag :type="expired(p)?'warning':p.status==='invalidated'?'danger':'info'">{{ expired(p)?'Caducado':statusNames[p.status] }}</el-tag></div><div class="levels"><div>Entrada<strong>{{ number(p.entry,8) }}</strong></div><div>Objetivo<strong class="positive">{{ number(p.target,8) }}</strong></div><div>Stop-loss<strong>{{ number(p.stop,8) }}</strong></div></div><p class="notes">{{ p.notes||'Sin notas de análisis.' }}</p><p class="muted">Caducidad: {{ date(p.expiresAt) }}</p><div class="plan-actions"><el-button size="small" @click="usePlan(p)">Usar en calculadora</el-button><el-button size="small" link type="primary" @click="editPlan(p)">Editar</el-button><el-button size="small" link type="danger" @click="remove('plans',p)">Eliminar</el-button></div></article>
          </section><section class="panel calculator"><p class="eyebrow">03 / RIESGO</p><h2>Calcula tu posición</h2><p class="muted">Para una compra spot. Usa la misma moneda en capital y precios. Valores iniciales de ejemplo.</p><el-form novalidate label-position="top" @submit.prevent="calculate"><div class="form-grid"><el-form-item label="Capital disponible"><el-input-number v-model="calculation.capital" :min="0.00000001" :controls="false"/></el-form-item><el-form-item label="Riesgo (%)"><el-input-number v-model="calculation.risk" :min="0.01" :max="100" :controls="false"/></el-form-item><el-form-item label="Entrada"><el-input-number v-model="calculation.entry" :min="0.00000001" :controls="false"/></el-form-item><el-form-item label="Stop-loss"><el-input-number v-model="calculation.stop" :min="0.00000001" :controls="false"/></el-form-item><el-form-item label="Objetivo"><el-input-number v-model="calculation.target" :min="0.00000001" :controls="false"/></el-form-item><el-form-item label="Comisión por lado (%)"><el-input-number v-model="calculation.fee" :min="0" :max="10" :controls="false"/></el-form-item></div><el-button type="primary" native-type="submit" :loading="calculating" class="full-width">Calcular posición</el-button></el-form><el-alert v-if="calculationError" :title="calculationError" type="error" :closable="false" class="notice"/><div v-if="result" class="calculation-result" aria-live="polite"><p>Importe de compra <b>{{ number(result.investment) }}</b></p><p>Cantidad de activo <b>{{ number(result.quantity,12) }}</b></p><p>Coste con comisión <b>{{ number(result.cost) }}</b></p><p>Pérdida estimada en stop <b>{{ number(result.loss,4) }}</b></p><p>Beneficio neto objetivo <b>{{ number(result.profit,4) }}</b></p><p>Beneficio / riesgo <b>{{ number(result.ratio) }} : 1</b></p></div><p class="footnote">Incluye comisiones. No incluye deslizamiento ni redondeo a los mínimos del exchange. El stop no garantiza el precio de salida.</p></section></div>
        </el-tab-pane>
      </el-tabs>
      <footer>ASYNE FINANCE <span>Datos guardados en PostgreSQL local · sin ejecución automática</span></footer>
    </main>
    <el-dialog v-model="positionDialog" :title="editingId?'Editar posición':'Añadir posición'" width="680px" :close-on-click-modal="false">
      <el-form novalidate label-position="top" @submit.prevent="savePosition">
        <div class="form-grid">
          <el-form-item label="Tipo de activo"><el-select v-model="assetKind" @change="searchAssets('')"><el-option label="Todos" value="all"/><el-option label="Criptomonedas" value="crypto"/><el-option label="Acciones" value="stock"/><el-option label="ETF" value="etf"/></el-select></el-form-item>
          <el-form-item :label="editingId&&!position.assetId?`Activo / símbolo: ${position.symbol}`:'Activo / símbolo'"><el-select v-model="position.assetId" filterable remote :remote-method="searchAssets" :loading="assetLoading" placeholder="Buscar símbolo o nombre" @change="selectAsset"><el-option v-for="a in selectorAssets" :key="a.id" :label="assetLabel(a)" :value="a.id" :disabled="!a.active"/></el-select></el-form-item>
          <el-form-item label="Moneda de valoración"><el-select v-model="position.currency" disabled><el-option v-for="c in currencies" :key="c" :label="c" :value="c"/></el-select></el-form-item>
        </div>
        <el-alert v-if="editingId&&!position.assetId" title="Puedes editar esta posición conservando su símbolo y moneda. Asocia una cotización solo cuando coincidan el instrumento y la moneda." type="info" :closable="false" class="notice"/>
        <p v-if="selectedAsset" class="muted">{{ selectedAsset.exchange }} · {{ selectedAsset.currency }}. Al cambiar de activo, vuelve a introducir tus niveles de entrada y salida; no se convierten monedas.</p>
        <el-form-item label="Tamaño de la posición"><el-radio-group v-model="positionMode" @change="changePositionMode"><el-radio-button value="amount">Por monto</el-radio-button><el-radio-button value="quantity">Por cantidad</el-radio-button></el-radio-group></el-form-item>
        <div class="form-grid">
          <el-form-item v-if="positionMode==='amount'" :label="`Monto a invertir (${position.currency})`"><el-input-number v-model="position.amount" :controls="false" :min="0" :max="1e12" placeholder="Ej. 1000"/></el-form-item>
          <el-form-item v-else label="Cantidad de activo"><el-input-number v-model="position.quantity" :controls="false" :min="0" :max="1e12"/></el-form-item>
          <el-form-item :label="`Precio de entrada (${position.currency})`"><el-input-number v-model="position.averagePrice" :controls="false" :min="0" :max="1e12" placeholder="Ej. 100"/></el-form-item>
          <el-form-item v-if="!position.exits?.length" :label="`Salida objetivo (${position.currency}, opcional)`"><el-input-number v-model="position.targetPrice" :controls="false" :min="0" :max="1e12" placeholder="Ej. 120"/></el-form-item>
          <el-form-item :label="`Stop-loss (${position.currency}, opcional)`"><el-input-number v-model="position.stopLoss" :controls="false" :min="0" :max="1e12" placeholder="Ej. 90"/></el-form-item>
          <el-form-item label="Precio actual del mercado"><div class="quote-box"><strong>{{ selectedQuote?.price!=null?`${number(selectedQuote.price,8)} ${selectedAsset?.currency}`:'—' }}</strong><div>{{ quoteLabel(selectedQuote,clock) }}</div><small v-if="selectedQuote?.asOf">{{ selectedQuote.source }} · {{ date(selectedQuote.asOf) }}</small></div></el-form-item>
          <el-form-item label="Estrategia"><el-select v-model="position.strategy"><el-option label="Largo plazo" value="long_term"/><el-option label="Swing" value="swing"/></el-select></el-form-item>
        </div>
        <section class="exit-editor">
          <div class="section-heading"><h3>Salidas parciales pendientes</h3><el-button size="small" :disabled="position.exits?.length>=50" @click="position.targetPrice=null;position.exits.push({quantity:null,targetPrice:null})">Añadir salida</el-button></div>
          <p class="muted">Cada salida vende una parte de esta posición. El resto permanece en cartera.</p>
          <div v-for="(exit,index) in position.exits" :key="index" class="exit-row">
            <el-form-item :label="`Cantidad · salida ${index+1}`"><el-input-number v-model="exit.quantity" :controls="false" :min="0" :max="1e12"/></el-form-item>
            <el-form-item :label="`Precio (${position.currency})`"><el-input-number v-model="exit.targetPrice" :controls="false" :min="0" :max="1e12"/></el-form-item>
            <el-button type="danger" link :aria-label="`Quitar salida ${index+1}`" @click="position.exits.splice(index,1)">Quitar</el-button>
            <small v-if="exit.quantity>0&&exit.targetPrice>position.averagePrice">Ganancia bruta: {{ number(exit.quantity*(exit.targetPrice-position.averagePrice),8) }} {{ position.currency }}</small>
          </div>
        </section>
        <el-alert v-if="positionLevelError" :title="positionLevelError" type="warning" :closable="false" show-icon/>
        <section class="calculation-result position-preview" aria-live="polite" aria-label="Resultado potencial de la posición">
          <h3>Resultado potencial</h3>
          <template v-if="outcome">
            <p>Cantidad de activo <b>{{ number(outcome.quantity,12) }}</b></p>
            <p>Monto invertido <b>{{ number(outcome.amount,8) }} {{ position.currency }}</b></p>
            <p>{{ position.exits?.length?'Ganancia de las salidas asignadas':'Ganancia en el objetivo' }} <b class="positive">{{ outcome.profit===null?'—':`+${number(outcome.profit,8)} ${position.currency} (+${number(outcome.profitPercent)} %)` }}</b></p>
            <p v-if="position.exits?.length">Sin salida asignada <b>{{ number(outcome.remaining,12) }} unidades</b></p>
            <p>Pérdida en el stop <b class="negative">{{ outcome.loss===null?'—':`−${number(outcome.loss,8)} ${position.currency} (−${number(outcome.lossPercent)} %)` }}</b></p>
            <p>Beneficio / riesgo <b>{{ outcome.ratio===null?'—':`${number(outcome.ratio)} : 1` }}</b></p>
          </template>
          <p v-else>Introduce el monto y la entrada para calcular. Añade salida y stop para ver ambos escenarios.</p>
        </section>
        <p class="footnote">Estimaciones para una compra, sin comisiones ni deslizamiento. Monto y precios en {{ position.currency }}. El stop se calcula sobre toda la posición antes de las salidas. El beneficio parcial excluye las unidades sin objetivo; su porcentaje usa el coste total. El stop no garantiza el precio de salida.</p>
        <p class="muted">Guardar registra una posición que tú declaras; no envía ninguna orden.</p>
        <div class="dialog-actions"><el-button @click="positionDialog=false">Cancelar</el-button><el-button type="primary" native-type="submit" :loading="saving" :disabled="(!position.assetId&&!editingId)||!outcome||!!positionLevelError">Guardar posición</el-button></div>
      </el-form>
    </el-dialog>
    <el-dialog v-model="planDialog" :title="editingId?'Editar plan':'Crear plan de trading'" width="620px" :close-on-click-modal="false"><el-form novalidate label-position="top" @submit.prevent="savePlan"><div class="form-grid"><el-form-item label="Activo / par"><el-input v-model="plan.symbol" maxlength="20" placeholder="Ej. BTC/USDT"/></el-form-item><el-form-item label="Mercado / broker"><el-input v-model="plan.market" maxlength="80" placeholder="Ej. Binance spot"/></el-form-item><el-form-item label="Moneda"><el-select v-model="plan.currency"><el-option v-for="c in currencies" :key="c" :label="c" :value="c"/></el-select></el-form-item><el-form-item label="Estado"><el-select v-model="plan.status"><el-option v-for="(label,value) in statusNames" :key="value" :label="label" :value="value"/></el-select></el-form-item><el-form-item label="Entrada limitada"><el-input-number v-model="plan.entry" :controls="false" :min="0.00000001"/></el-form-item><el-form-item label="Stop-loss"><el-input-number v-model="plan.stop" :controls="false" :min="0.00000001"/></el-form-item><el-form-item label="Venta objetivo"><el-input-number v-model="plan.target" :controls="false" :min="0.00000001"/></el-form-item><el-form-item label="Caducidad (hora local)"><el-date-picker v-model="plan.expiresAt" type="datetime" placeholder="Sin caducidad"/></el-form-item></div><el-form-item label="Motivo técnico e invalidación"><el-input v-model="plan.notes" type="textarea" :rows="3" maxlength="2000" show-word-limit/></el-form-item><div class="dialog-actions"><el-button @click="planDialog=false">Cancelar</el-button><el-button type="primary" native-type="submit" :loading="saving">Guardar plan</el-button></div></el-form></el-dialog>
  </el-config-provider>
</template>



