export function salonDate(year,customDate){
 const valid=typeof customDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(customDate)&&Number(customDate.slice(0,4))===year&&!Number.isNaN(Date.parse(customDate));
 if(valid)return customDate;
 if(year===2026)return '2026-10-03';
 if(year===2027)return '2027-10-02';
 const first=new Date(Date.UTC(year,9,1)).getUTCDay();
 return year+'-10-'+String(1+(6-first+7)%7).padStart(2,'0');
}
export const MINUTE_START=8*60, MINUTE_END=20*60;
export const minutes=time=>{if(!/^\d{2}:\d{2}$/.test(time||''))return NaN;const [h,m]=time.split(':').map(Number);return h<24&&m<60?h*60+m:NaN};
export const validAnimation=(start,end)=>Number.isFinite(minutes(start))&&Number.isFinite(minutes(end))&&minutes(start)>=MINUTE_START&&minutes(end)<=MINUTE_END&&minutes(end)>minutes(start);
// Les animations qui se recouvrent occupent des colonnes distinctes ; toutes restent cliquables.
export function animationLayout(items){
 const valid=items.filter(x=>validAnimation(x.start,x.end)).sort((a,b)=>minutes(a.start)-minutes(b.start)||minutes(a.end)-minutes(b.end));
 const result=[];let cluster=[],end=-1;
 function flush(){if(!cluster.length)return;const lanes=[];for(const event of cluster){let lane=lanes.findIndex(finish=>finish<=minutes(event.start));if(lane<0)lane=lanes.length;lanes[lane]=minutes(event.end);result.push({...event,lane,columns:0});}for(const row of result.slice(-cluster.length))row.columns=lanes.length;cluster=[];end=-1;}
 for(const event of valid){if(minutes(event.start)>=end)flush();cluster.push(event);end=Math.max(end,minutes(event.end));}flush();return result;
}
