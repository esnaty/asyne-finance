// Published NYSE cash-equity calendar. Unknown years fail closed.
// Source verified 2026-09-27: https://www.nyse.com/trade/hours-calendars
export const calendarSource='https://www.nyse.com/trade/hours-calendars';
const holidays={
  2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
  2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
  2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25']
};
const earlyCloses=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
export function nyseSchedule(task,now=new Date()){
  if(!['analysis','report'].includes(task))throw new Error('Tarea desconocida.');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k).value;
  const day=`${get('year')}-${get('month')}-${get('day')}`,year=Number(get('year'));
  const known=Object.hasOwn(holidays,year),tradingDay=known&&!['Sat','Sun'].includes(get('weekday'))&&!holidays[year].includes(day.slice(5));
  const close=earlyCloses.has(day)?13*60:16*60,open=9*60+30,minute=Number(get('hour'))*60+Number(get('minute'));
  const target=task==='analysis'?open:close;
  // Allow bounded scheduler latency, but do not catch up hours later.
  const due=tradingDay&&minute>=target&&minute<target+45;
  return {task,day,timeZone:'America/New_York',localTime:`${get('hour')}:${get('minute')}`,calendarVerified:known,tradingDay,
    open:tradingDay?'09:30':null,close:tradingDay?(close===780?'13:00':'16:00'):null,
    earlyClose:tradingDay&&close===780,due,
    reason:!known?'Calendario no verificado para este año.':!tradingDay?'NYSE cerrada: fin de semana o festivo.':due?'Corresponde ejecutar la tarea de esta sesión.':'Fuera de la ventana de ejecución.',
    source:calendarSource,exceptionalClosuresRequireVerification:true};
}
