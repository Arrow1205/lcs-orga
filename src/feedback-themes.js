export const normalizeVerbatim=text=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

const rules={
 highlights:{
  'Éloges':[/\b(ne changez rien|ne rien changer|rien a changer|rien a redire|vous etes parfaits?|parfait|au top|bravo|excellent|genial|super|formidable|continuez comme ca|tres bien|ador[eé]|j ai aime|j ai beaucoup aime)\b/],
  'Ambiance':[/\bambiance\b/,/\bconvivial/,/\batmosphere/],
  'Exposants et offre':[/\b(exposants?|stands?|choix|variete|produits?|cartes?)\b/],
  'Organisation':[/\b(organisation|organise|accueil|equipe|benevoles?)\b/],
  'Animations':[/\b(animations?|dedicaces?|activites?|conferences?)\b/]
 },
 improvements:{
  'Forte affluence':[/\b(trop de monde|beaucoup trop de monde|foule|bonde|surpeuple|surfrequente|affluence|surcharge|embouteill|bouchon|impraticable|trop serre|manque de place|difficile de circuler|circulation difficile)\b/,/\ballees?\b.{0,35}\b(etroites?|pleines?|encombrees?|impraticables?)\b/],
  'Attente et entrée':[/\b(attente|file d attente|faire la queue|queue|controle|billetterie)\b/],
  'Prix et valeur':[/\b(prix|cher|tarif|budget|cout|rapport qualite prix)\b/],
  'Exposants et offre':[/\b(exposants?|stands?|choix|variete|produits?|cartes?)\b/],
  'Zones et signalétique':[/\b(zones?|signaletique|orientation|panneaux?|plan du salon)\b/],
  'Animations':[/\b(animations?|dedicaces?|activites?|conferences?)\b/],
  'Confort et restauration':[/\b(chaleur|chaud|toilettes?|repas|boissons?|restauration|bruit|assises?|sieges?|food trucks?)\b/]
 }
};

export function themesFor(text,field='improvements'){
 const normalized=normalizeVerbatim(text);
 if(!normalized)return [];
 const set=rules[field]||rules.improvements;
 const found=Object.entries(set).filter(([,patterns])=>patterns.some(pattern=>pattern.test(normalized))).map(([name])=>name);
 return found.length?found:['Autres retours'];
}

export function groupComments(values,field='improvements'){
 const groups=new Map();
 for(const value of values){
  if(typeof value!=='string'||!value.trim())continue;
  const quote=value.trim(),key=normalizeVerbatim(quote);
  for(const name of themesFor(quote,field)){
   if(!groups.has(name))groups.set(name,{name,count:0,variants:new Map()});
   const group=groups.get(name);group.count++;
   const existing=group.variants.get(key);
   if(existing)existing.count++;else group.variants.set(key,{text:quote,count:1});
  }
 }
 return [...groups.values()].map(({name,count,variants})=>({name,count,quotes:[...variants.values()].sort((a,b)=>b.count-a.count)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'fr'));
}
