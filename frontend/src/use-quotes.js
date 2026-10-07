import { ref,watch,onUnmounted } from 'vue';
export function useQuotes(assetIds){
  const quotes=ref({}),clock=ref(Date.now());let stream,generation=0;
  function connect(){
    generation++;const current=generation;stream?.close();
    const ids=assetIds.value.slice(0,50);
    if(!ids.length||document.hidden)return;
    stream=new EventSource(`/api/quotes/stream?ids=${encodeURIComponent(ids.join(','))}`);
    stream.onmessage=event=>{
      if(current!==generation)return;
      try{const q=JSON.parse(event.data);if(!ids.includes(q.assetId))return;const old=quotes.value[q.assetId];
        if(q.price!=null&&old?.asOf&&Date.parse(q.asOf)<Date.parse(old.asOf))return;
        quotes.value={...quotes.value,[q.assetId]:{...old,...q,price:q.price??old?.price??null}};
      }catch{/* Ignore invalid stream data. */}
    };
    stream.onerror=()=>{if(current!==generation)return;for(const id of ids)quotes.value={...quotes.value,[id]:{...quotes.value[id],assetId:id,status:'disconnected',message:'Conexión interrumpida. Reconectando…'}};};
  }
  watch(()=>assetIds.value.join(','),connect,{immediate:true});
  document.addEventListener('visibilitychange',connect);
  const timer=setInterval(()=>{clock.value=Date.now();},5000);
  onUnmounted(()=>{generation++;stream?.close();clearInterval(timer);document.removeEventListener('visibilitychange',connect);});
  return {quotes,clock};
}
export const quoteMaxAge=q=>q?.source==='Twelve Data'?(q.status==='closed'?1890000:390000):90000;
export function quoteUsable(q,now=Date.now()){
  return q&&Number.isFinite(q.price)&&q.price>0&&['live','snapshot','closed'].includes(q.status)&&
    Number.isFinite(Date.parse(q.receivedAt))&&now-Date.parse(q.receivedAt)<quoteMaxAge(q);
}
export function quoteLabel(q,now=Date.now()){
  if(!q)return 'Esperando cotización…';
  if(q.receivedAt&&['live','snapshot','closed'].includes(q.status)&&now-Date.parse(q.receivedAt)>=quoteMaxAge(q))return 'Cotización antigua · esperando actualización';
  return q.message||'Cotización no disponible';
}
