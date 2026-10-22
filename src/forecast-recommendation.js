import {forecastProTotals} from './forecast-pro.js';
import {forecastPartnerAmount,forecastOptionTotals,forecastTableCounts,forecastTicketLine} from './forecast.js';
const num=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,n):0};
const money=v=>Math.round(num(v)*100),count=v=>Math.floor(num(v));
export const recommendationMargin=v=>Math.min(20000,Math.max(0,Math.round(num(v)/500)*500));

// A bounded minimax search over the actual configured stand hypotheses.
// No forecast inputs or financial totals are mutated by the recommendation.
export function recommendForecast(f,expenses,requestedMargin=0){
 const margin=recommendationMargin(requestedMargin),tables=forecastTableCounts(f).total,cost=money(expenses),rentRate=money(f.rentalSqmPrice),partnerTableRate=money(f.partnerTablePrice);
 const stands=[],fixed=[];
 for(const row of f.partnerLines||[]){const options=forecastOptionTotals(row,f),reserved=row.tablesEnabled?count(row.tables):0,area=row.areaEnabled?num(row.area):0;
  if(area>0)stands.push({name:row.name||'Partenaire',area,tables:reserved,fees:reserved*partnerTableRate+money(options.revenue),optionCost:money(options.cost)});
  else if(reserved||options.revenue||options.cost)fixed.push(row);
 }
 for(const row of f.extraRevenue||[])if(row.kind==='m²'&&num(row.quantity)>0)stands.push({name:row.name||'Partenaire',area:num(row.quantity),tables:0,fees:0,optionCost:0});
 const legacyFixed=(f.extraRevenue||[]).filter(r=>r.kind==='Table'&&num(r.quantity)>0),fixedCount=fixed.length+legacyFixed.length;
 const context={margin,tables,configuredStandCount:stands.length,configuredArea:stands.reduce((n,s)=>n+s.area,0),configuredSqmPrice:num(f.priceSqm)};
 if(!tables)return {...context,ok:false,message:'Renseigne les quantités de tables dans Configuration des tables et Partenaires pour calculer une répartition.'};
 if(!cost)return {...context,ok:false,message:'Renseigne les dépenses du prévisionnel avant de calculer les tarifs recommandés.'};
 if(stands.length+fixedCount>6)return {...context,ok:false,message:'Plus de six lignes partenaires actives sont renseignées. Limite les hypothèses à six partenaires pour respecter le plafond demandé.'};
 const fixedTables=fixed.reduce((n,r)=>n+count(r.tablesEnabled?r.tables:0),0)+legacyFixed.reduce((n,r)=>n+count(r.quantity),0);
 const averageArea=stands.length?context.configuredArea/stands.length:0,baselineSqm=averageArea?150000/averageArea:0;
 let other=money(forecastProTotals(f).area);
 for(const key of ['ticketGeneral','ticketVIP','ticketEarly'])other+=money(forecastTicketLine(f,key).amount);
 for(const row of f.extraRevenue||[])if(row.kind!=='m²')other+=money(row.kind==='Table'?count(row.quantity)*num(f.partnerTablePrice):num(row.amount));
 other+=fixed.reduce((n,r)=>n+money(forecastPartnerAmount(r,f)),0);
 const fixedExpenses=cost-Math.round(context.configuredArea*rentRate)-stands.reduce((n,s)=>n+s.optionCost,0);
 let best;
 for(let mask=0;mask<2**stands.length;mask++){
  const selected=stands.filter((_,i)=>mask&(1<<i)),partnerCount=fixedCount+selected.length;if(partnerCount>6)continue;
  const area=selected.reduce((n,s)=>n+s.area,0),reserved=selected.reduce((n,s)=>n+s.tables,0)+fixedTables,available=tables-reserved,maxPro=Math.floor((available-1)/2),minPro=available>=3?1:0;
  if(available<1||maxPro<minPro)continue;
  const projectedExpenses=Math.max(0,fixedExpenses+Math.round(area*rentRate)+selected.reduce((n,s)=>n+s.optionCost,0)),target=projectedExpenses+Math.max(1,money(margin)),fixedRevenue=other+selected.reduce((n,s)=>n+s.fees,0);
  const rates=factor=>({pro:Math.floor(15000*factor+1e-7),private:Math.floor(5000*factor+1e-7),sqm:area?Math.floor(baselineSqm*factor+1e-7):0});
  const maxRevenue=factor=>{const r=rates(factor);return fixedRevenue+maxPro*r.pro+(available-maxPro)*r.private+Math.round(area*r.sqm)};
  let low=Math.max(1,area&&baselineSqm?rentRate/baselineSqm:1),high=low;
  while(maxRevenue(high)<target&&high<1e12)high*=2;
  if(maxRevenue(high)<target)continue;
  if(maxRevenue(low)<target){for(let i=0;i<55;i++){const mid=(low+high)/2;if(maxRevenue(mid)>=target)high=mid;else low=mid}}else high=low;
  const r=rates(high),difference=r.pro-r.private;
  const pro=Math.max(minPro,Math.min(maxPro,Math.ceil((target-fixedRevenue-Math.round(area*r.sqm)-available*r.private)/difference))),privateTables=available-pro;
  if(privateTables<=pro)continue;
  // Once the table-price ceiling is known, use only the m² price needed for the target.
  const sqm=area?Math.max(rentRate,Math.floor(baselineSqm),0,Math.ceil((target-fixedRevenue-pro*r.pro-privateTables*r.private)/area-1e-7)):0;
  const revenue=fixedRevenue+pro*r.pro+privateTables*r.private+Math.round(area*sqm);
  if(revenue<target)continue;
  const proRate=pro?r.pro:15000;const increase=Math.max(0,pro?proRate/15000-1:0,r.private/5000-1,area?sqm/baselineSqm-1:0);
  const candidate={...context,ok:true,proTables:pro,privateTables,partnerCount,standCount:selected.length,partnerTables:reserved,area,pricePro:proRate/100,pricePrivate:r.private/100,priceSqm:area?sqm/100:null,baselineSqm:baselineSqm/100,revenue:revenue/100,expenses:projectedExpenses/100,profit:(revenue-projectedExpenses)/100,increase,selectedNames:selected.map(s=>s.name),fixedPartnerCount:fixedCount};
  if(!best||increase<best.increase-1e-9||(Math.abs(increase-best.increase)<1e-9&&(selected.length>best.standCount||(selected.length===best.standCount&&(privateTables>best.privateTables||(privateTables===best.privateTables&&partnerCount<best.partnerCount))))))best=candidate;
 }
 return best||{...context,ok:false,message:'Aucune répartition ne respecte les tables disponibles et la majorité de particuliers. Vérifie les tables réservées aux partenaires.'};
}

function resultMarkup(f,expenses,margin,esc,euro){
 const r=recommendForecast(f,expenses,margin);
 if(!r.ok)return `<p class="note" role="status">${esc(r.message)}</p>`;
 const change=(price,base)=>price>base?`+${((price/base-1)*100).toLocaleString('fr-FR',{maximumFractionDigits:2})} %`:'Sans hausse';
 return `<div class="recommendation-table-wrap"><table class="recommendation-table"><thead><tr><th>Profil</th><th>Répartition proposée</th><th>Tarif recommandé</th><th>Évolution</th></tr></thead><tbody><tr><th>Pro</th><td>${r.proTables} tables</td><td>${euro(r.pricePro)} / table</td><td>${change(r.pricePro,150)}</td></tr><tr><th>Particulier</th><td>${r.privateTables} tables</td><td>${euro(r.pricePrivate)} / table</td><td>${change(r.pricePrivate,50)}</td></tr><tr><th>Partenaire</th><td>${r.partnerCount} partenaire(s) · ${r.area.toLocaleString('fr-FR',{maximumFractionDigits:2})} m² · ${r.partnerTables} table(s)</td><td>${r.priceSqm===null?'Aucun stand au m² retenu':euro(r.priceSqm)+' / m²'}</td><td>${r.priceSqm===null?'—':change(r.priceSqm,r.baselineSqm)}</td></tr></tbody></table></div><div class="recommendation-projection" aria-label="Projection indépendante"><div><span>Recettes projetées</span><strong>${euro(r.revenue)}</strong></div><div><span>Dépenses projetées</span><strong>${euro(r.expenses)}</strong></div><div><span>Résultat projeté</span><strong>${euro(r.profit)}</strong></div></div><p class="sub">${r.proTables+r.privateTables+r.partnerTables} tables réparties : ${r.proTables} pro + ${r.privateTables} particuliers + ${r.partnerTables} partenaires. Les tables des stands sont incluses dans ce total.</p><p class="sub">${r.configuredStandCount?r.configuredStandCount+' hypothèse(s) de stand au m² renseignée(s), '+r.configuredArea.toLocaleString('fr-FR')+' m² au total. Tarif actuellement configuré : '+euro(r.configuredSqmPrice)+'/m².':'Aucune surface de stand renseignée : ajoute une surface dans le bloc Partenaires pour obtenir un tarif au m².'} ${r.selectedNames.length?'Stands retenus : '+r.selectedNames.map(esc).join(', ')+'.':''}</p><details class="recommendation-method"><summary>Hypothèses du calcul</summary><p>Références historiques : 150 € par table pro, 50 € par table particulier et 5 partenaires à 1 500 € chacun. Le tarif de référence au m² est l’équivalent de 1 500 € sur la surface moyenne des stands saisis${r.baselineSqm?' ('+euro(r.baselineSqm)+'/m²)':''}.</p><p>La recherche limite d’abord la hausse maximale des tarifs historiques, puis conserve autant que possible les stands partenaires saisis, puis privilégie le plus grand nombre de particuliers. À égalité, elle retient le moins de partenaires. Au plus six partenaires ; au moins un pro lorsque trois tables ou plus restent disponibles pour les exposants. Les tarifs sont calculés au centime. Les tarifs pro et particulier ne descendent pas sous 150 € et 50 €. Le tarif au m² ne descend pas sous son équivalent historique ni sous le coût de location.</p><p>Seules les surfaces déjà saisies sont comparées. Les locations au m² et les coûts d’options sont recalculés selon les stands retenus. Les autres dépenses restent celles du prévisionnel. Billetterie, surfaces pro configurées, recettes supplémentaires, tables et options partenaires sont incluses une seule fois. Les tarifs des partenaires hors m² sont conservés. Pour la comparaison, les 1 500 € historiques servent de référence à la surface seule ; tables et options sont facturées en plus, aux tarifs déjà configurés.</p><p>Il s’agit d’une projection supposant les emplacements proposés vendus, sans prédiction de demande. Aucun tarif n’est appliqué au prévisionnel. À 0 € de marge cible, le résultat recherché reste strictement positif.</p></details>`;
}
export function forecastRecommendationMarkup(f,expenses,esc,euro){const margin=recommendationMargin(f.recommendationMargin);return `<details class="panel forecast-recommendation" open data-recommendation-expenses="${expenses}"><summary><h2>Recommandation</h2><span>Projection indépendante</span></summary><div class="recommendation-body"><p class="sub">Compare les tarifs et la répartition pour couvrir les dépenses avec la plus faible hausse maximale des tarifs historiques. Plus de particuliers que de pros, six partenaires maximum.</p><label class="recommendation-margin" for="forecastMargin">Marge cible <output for="forecastMargin" data-recommendation-margin-label>${euro(margin)}</output></label><input id="forecastMargin" aria-label="Marge cible en euros" type="range" min="0" max="20000" step="500" value="${margin}" data-recommendation-margin><div class="recommendation-range-labels"><span>0 €</span><span>Pas de 500 €</span><span>20 000 €</span></div><div data-recommendation-results aria-live="polite">${resultMarkup(f,expenses,margin,esc,euro)}</div></div></details>`}
export function mountForecastRecommendations(getForecast,save,canSave,esc,euro){const root=document.querySelector('.forecast-recommendation'),slider=root?.querySelector('[data-recommendation-margin]');if(!slider)return;slider.addEventListener('input',()=>{const margin=recommendationMargin(slider.value);root.querySelector('[data-recommendation-margin-label]').textContent=euro(margin);root.querySelector('[data-recommendation-results]').innerHTML=resultMarkup(getForecast(),Number(root.dataset.recommendationExpenses),margin,esc,euro)});slider.addEventListener('change',()=>{if(canSave()){getForecast().recommendationMargin=recommendationMargin(slider.value);save()}})}
