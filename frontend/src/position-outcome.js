// Gross estimates for a long spot position. No fees or execution guarantees.
export function currentOutcome({quantity,averagePrice,currentPrice}) {
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(averagePrice)||averagePrice<=0||!Number.isFinite(currentPrice)||currentPrice<0)return null;
  const profit=quantity*(currentPrice-averagePrice);
  return {profit,percent:(currentPrice-averagePrice)/averagePrice*100};
}

export function positionOutcome({amount,quantity,averagePrice,targetPrice,stopLoss,exits=[]},mode='amount') {
  const valid=n=>Number.isFinite(n)&&n>0;
  if(!valid(averagePrice)||!valid(mode==='amount'?amount:quantity))return null;
  const units=mode==='amount'?amount/averagePrice:quantity;
  const invested=mode==='amount'?amount:units*averagePrice;
  const allocated=exits.reduce((sum,e)=>sum+(e.quantity||0),0);
  const partialValid=exits.every(e=>valid(e.quantity)&&valid(e.targetPrice)&&e.targetPrice>averagePrice)&&allocated<=units+Number.EPSILON*units*4;
  const profit=exits.length?(partialValid?exits.reduce((sum,e)=>sum+e.quantity*(e.targetPrice-averagePrice),0):null):valid(targetPrice)&&targetPrice>averagePrice?units*(targetPrice-averagePrice):null;
  const loss=valid(stopLoss)&&stopLoss<averagePrice?units*(averagePrice-stopLoss):null;
  return {...(exits.length?{allocated,remaining:Math.max(0,units-allocated)}:{}),quantity:units,amount:invested,profit,loss,
    profitPercent:profit===null?null:profit/invested*100,
    lossPercent:loss===null?null:loss/invested*100,
    ratio:profit===null||loss===null||(exits.length&&allocated<units-Number.EPSILON*units*4)?null:profit/loss};
}
