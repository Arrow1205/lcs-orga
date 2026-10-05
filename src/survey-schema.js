export const types=['visiteur','vip','exposant'];
export const common=[
 {key:'satisfaction',label:'Quelle note globale donnerais-tu au salon ?',kind:'rating',required:true},
 {key:'highlights',label:'Quel est le point que tu as le plus apprécié ?',kind:'text',hint:'Un détail précis nous aide beaucoup.'},
 {key:'improvements',label:'Qu’est-ce qui t’a gêné ou que nous pourrions améliorer ?',kind:'text',hint:'Réponse libre, même si tu n’as qu’un seul point.'},
 {key:'returnIntent',label:'Aurais-tu envie de revenir à la prochaine édition ?',kind:'choice',options:['Oui','Peut-être','Non'],required:true}
];
export const questions={
 visiteur:[
  {key:'community',label:'Qu’est-ce qui t’intéresse le plus ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Plusieurs univers','Je suis surtout curieux·se'],required:true},
  {key:'discovery',label:'Comment as-tu découvert le salon ?',kind:'choice',options:['Instagram','Facebook','Bouche à oreille','Presse / média','Autre']},
  {key:'duration',label:'Combien de temps es-tu resté·e ?',kind:'choice',options:['Moins d’une heure','1 à 2 heures','2 à 4 heures','Plus de 4 heures'],required:true},
  {key:'purchase',label:'As-tu fait des achats sur place ?',kind:'choice',options:['Oui','Non'],required:true},
  {key:'zones',label:'Dans quelle zone as-tu passé le plus de temps ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Un peu partout','Je ne sais pas']},
  ...common
 ],
 vip:[
  {key:'premiumType',label:'Quel billet premium avais-tu ?',kind:'choice',options:['VIP','Early Access'],required:true},
  {key:'premiumEntry',label:'Comment s’est passée ton entrée premium ?',kind:'rating',required:true},
  {key:'premiumValue',label:'Le supplément en valait-il la peine ?',kind:'choice',options:['Oui','En partie','Non'],required:true},
  {key:'community',label:'Qu’est-ce qui t’intéresse le plus ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Plusieurs univers','Je suis surtout curieux·se'],required:true},
  {key:'discovery',label:'Comment as-tu découvert le salon ?',kind:'choice',options:['Instagram','Facebook','Bouche à oreille','Presse / média','Autre']},
  {key:'zones',label:'Dans quelle zone as-tu passé le plus de temps ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Un peu partout','Je ne sais pas']},
  {key:'duration',label:'Combien de temps es-tu resté·e ?',kind:'choice',options:['Moins d’une heure','1 à 2 heures','2 à 4 heures','Plus de 4 heures'],required:true},
  {key:'purchase',label:'As-tu fait des achats sur place ?',kind:'choice',options:['Oui','Non'],required:true},
  ...common
 ],
 exposant:[
  {key:'participation',label:'Quel était ton rôle cette année ?',kind:'choice',options:['Exposant','Partenaire'],required:true},
  {key:'vendorType',label:'Quel type d’exposant étais-tu ?',kind:'choice',options:['Professionnel','Particulier','Artiste'],required:true,showIf:{key:'participation',equals:'Exposant'}},
  {key:'community',label:'Quelle était ta communauté principale ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Autre']},
  {key:'zone',label:'Dans quelle zone étais-tu installé·e ?',kind:'choice',options:['Basket','Soccer','Sport US','TCG','Autre']},
  {key:'setup',label:'Comment s’est passée ton installation ?',kind:'rating',required:true},
  {key:'attendance',label:'Comment juges-tu l’affluence dans ta zone ?',kind:'rating',required:true},
  {key:'value',label:'Quel est ton avis sur le rapport qualité prix ?',kind:'rating',required:true},
  {key:'roi',label:'Quel est ton avis sur le retour sur investissement ?',kind:'rating',required:true},
  ...common,
  {key:'identity',label:'Souhaites-tu laisser ton nom ou celui de ta société ?',kind:'text',hint:'Facultatif. Tu peux terminer sans t’identifier.'}
 ]
};
export function activeQuestions(type,answers,definitions=questions[type]){
 return (definitions||[]).filter(q=>!q.showIf||answers[q.showIf.key]===q.showIf.equals);
}
export function pruneInactiveAnswers(type,answers,definitions=questions[type]){
 let changed;
 do{
  const active=new Set(activeQuestions(type,answers,definitions).map(q=>q.key));
  changed=false;
  for(const key of Object.keys(answers))if(!active.has(key)){delete answers[key];changed=true}
 }while(changed);
 return answers;
}
export function validateAnswers(type,answers,definitions=questions[type]){
 if(!types.includes(type)||!answers||typeof answers!=='object'||Array.isArray(answers))return false;
 const all=definitions||[];
 const active=activeQuestions(type,answers,all);
 const keys=new Set(active.map(q=>q.key));
 return active.every(q=>{
  const v=answers[q.key];
  if(v===undefined||v===''||Array.isArray(v)&&!v.length)return !q.required;
  if(q.kind==='grid'){
   if(!v||typeof v!=='object'||Array.isArray(v)||!Array.isArray(q.rows)||!Array.isArray(q.columns))return false;
   const entries=Object.entries(v);
   return (!q.required||q.rows.every(row=>Object.hasOwn(v,row)))&&entries.every(([row,choice])=>q.rows.includes(row)&&typeof choice==='string'&&q.columns.includes(choice));
  }
  if(q.kind==='rating')return Number.isInteger(v)&&v>=0&&v<=5;
  if(q.kind==='rating10')return Number.isInteger(v)&&v>=0&&v<=10;
  if(q.kind==='checkbox')return Array.isArray(v)&&v.every(x=>typeof x==='string'&&q.options?.includes(x));
  if(q.kind==='number')return typeof v==='number'&&Number.isFinite(v);
  if(q.kind==='date')return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
  return typeof v==='string'&&v.length<=1200&&(!['choice','dropdown'].includes(q.kind)||q.options?.includes(v));
 })&&Object.entries(answers).every(([key,value])=>keys.has(key)&&(typeof value==='string'&&value.length<=1200||typeof value==='number'&&Number.isFinite(value)||Array.isArray(value)&&value.length<=20&&value.every(x=>typeof x==='string'&&x.length<=120)||!!active.find(q=>q.key===key&&q.kind==='grid')&&value&&typeof value==='object'&&!Array.isArray(value)));
}
