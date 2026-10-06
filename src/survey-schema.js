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
  {key:'q1_status',label:'Quel était votre statut sur le salon ?',kind:'choice',options:['Particulier','Professionnel','Partenaire'],required:true},
  {key:'q2_zone',label:'Dans quelle zone étiez-vous ?',kind:'choice',options:['Football','Basketball','Sports US','TCG / Pokémon'],required:true},
  {key:'q3_experience',label:'Globalement, quelle note donneriez-vous à votre expérience au Lille Card Show ?',kind:'rating10',hint:'Note de 1 à 10',required:true},
  {key:'q4_location',label:'Quelle note donneriez-vous à votre emplacement sur le salon ?',kind:'rating10',hint:'Note de 1 à 10',required:true},
  {key:'q5_space_fit',label:'L’espace que vous aviez sélectionné à l’inscription était-il adapté à votre activité ?',kind:'choice',options:['Beaucoup trop petit','Un peu trop petit','Adapté','Plus grand que nécessaire'],required:true},
  {key:'q6_space_limit',label:'Avez-vous renoncé à exposer une partie de vos produits par manque de place ?',kind:'choice',options:['Oui, beaucoup','Oui, un peu','Non'],required:true},
  {key:'q7_logistics',label:'Sur la logistique pure, comment évalueriez-vous les éléments suivants ?',kind:'grid',rows:['Installation / déchargement','Accès au stand','Espace derrière les tables','Largeur de votre espace','Circulation autour de votre stand','Espace de rangement / stockage','Mobilier mis à disposition'],columns:['1','2','3','4','5'],hint:'Note de 1 à 5 pour chaque élément.',required:true},
  {key:'q8_flow',label:'Comment évaluez-vous le flux de visiteurs devant votre stand ?',kind:'choice',options:['Très faible','Faible','Correct','Bon','Excellent'],required:true},
  {key:'q9_crowding',label:'Avez-vous connu des périodes où l’affluence était trop importante pour travailler correctement ou accueillir les visiteurs ?',kind:'choice',options:['Oui, régulièrement','Oui, ponctuellement','Non','Je ne sais pas'],required:true},
  {key:'q10_buying_type',label:'Selon vous, quel type d’achat les visiteurs recherchaient-ils principalement ?',kind:'choice',options:['Petites cartes / cartes à l’unité pour compléter des sets','Cartes milieu de gamme','Grosses pièces / High-End','Un mélange assez équilibré','Difficile à évaluer'],required:true},
  {key:'q11_card_budget',label:'Quel budget les visiteurs semblaient-ils généralement prêts à mettre sur une carte ?',kind:'choice',options:['Moins de 20 €','20 à 50 €','50 à 100 €','100 à 250 €','250 à 500 €','500 € et +','Difficile à estimer'],required:true},
  {key:'q12_best_sellers',label:'Quels produits se sont le mieux vendus sur votre stand ?',kind:'checkbox',options:['Singles petit budget','Singles milieu de gamme','Singles premium / High-End','Cartes gradées','Boxes / Displays','Boosters / Packs','Sets / Lots','Produits dérivés / accessoires','Autre'],required:true},
  {key:'q13_revenue',label:'Quel chiffre d’affaires approximatif avez-vous réalisé pendant le salon ?',kind:'choice',options:['Moins de 250 €','250 à 500 €','500 à 1 000 €','1 000 à 2 000 €','2 000 à 5 000 €','5 000 à 10 000 €','Plus de 10 000 €','Je préfère ne pas répondre'],required:true},
  {key:'q14_sales_expectations',label:'Par rapport à vos attentes avant le salon, vos ventes ont été :',kind:'choice',options:['Très inférieures à mes attentes','Inférieures à mes attentes','Conformes à mes attentes','Supérieures à mes attentes','Très supérieures à mes attentes'],required:true},
  {key:'q15_value',label:'Comment évaluez-vous le rapport qualité/prix de votre participation ?',kind:'rating10',hint:'Note de 1 à 10',required:true},
  {key:'q16_organization',label:'Comment évaluez-vous l’organisation exposant sur les éléments suivants ?',kind:'grid',rows:['Communication avant l’événement','Informations pratiques reçues','Accueil exposant','Installation','Signalétique','Circulation','Parking / chargement-déchargement','Accompagnement de l’organisation'],columns:['1','2','3','4','5'],hint:'Note de 1 à 5 pour chaque élément.',required:true},
  {key:'q17_return',label:'Envisagez-vous de revenir exposer au Lille Card Show lors de la prochaine édition ?',kind:'choice',options:['Oui, certainement','Oui, probablement','Je ne sais pas encore','Probablement pas','Non'],required:true},
  {key:'q18_no_return_reason',label:'Quelle est la principale raison qui pourrait vous empêcher de revenir ?',kind:'checkbox',options:['Tarif','Chiffre d’affaires insuffisant','Emplacement','Manque de visiteurs qualifiés','Manque d’espace','Logistique','Distance / déplacement','Date de l’événement','Format du salon','Autre'],required:true,showIf:{key:'q17_return',anyOf:['Probablement pas','Non']}},
  {key:'q19_next_config',label:'Si vous revenez, quelle configuration souhaiteriez-vous par rapport à cette année ?',kind:'checkbox',options:['Exactement la même','Plus de tables','Davantage d’espace autour de mes tables','Un véritable stand / espace en m²','Moins d’espace','Je ne sais pas encore'],required:true},
  {key:'q20_booking_choice',label:'Pour une prochaine édition, souhaiteriez-vous pouvoir choisir entre une réservation à la table et une réservation au m² ?',kind:'choice',options:['Oui','Non','Sans préférence'],required:true},
  {key:'q21_booking_type',label:'Quel type de réservation vous intéresserait principalement ?',kind:'choice',options:['Réservation à la table','Réservation au m²'],required:true,showIf:{key:'q20_booking_choice',equals:'Oui'}},
  {key:'q22_tables',label:'Combien de tables souhaiteriez-vous idéalement réserver ?',kind:'choice',options:['1 table','2 tables','3 tables','4 tables','5 tables','6 tables ou plus'],required:true,showIf:{key:'q21_booking_type',equals:'Réservation à la table'}},
  {key:'q23_surface',label:'Quelle surface souhaiteriez-vous idéalement réserver ?',kind:'choice',options:['4 à 6 m²','7 à 9 m²','10 à 12 m²','13 à 18 m²','19 à 25 m²','Plus de 25 m²'],required:true,showIf:{key:'q21_booking_type',equals:'Réservation au m²'}},
  {key:'q24_budget_increase',label:'Si un espace plus grand vous était proposé, seriez-vous prêt à augmenter votre budget exposant ?',kind:'choice',options:['Oui, clairement','Oui, légèrement','Peut-être, selon le tarif','Non'],required:true},
  {key:'q25_improvement',label:'Quelle est la principale chose que nous devrions améliorer pour la prochaine édition ?',kind:'text'},
  {key:'q26_keep',label:'Y a-t-il au contraire quelque chose que vous souhaitez absolument que nous conservions tel quel ?',kind:'text'},
  {key:'q27_suggestion',label:'Avez-vous une remarque, une idée ou une suggestion complémentaire ?',kind:'text'}
 ]
};
function conditionMatches(condition,answers){
 if(!condition)return true;
 const value=answers[condition.key];
 if(Array.isArray(condition.anyOf))return condition.anyOf.includes(value);
 return value===condition.equals;
}
export function activeQuestions(type,answers,definitions=questions[type]){
 return (definitions||[]).filter(q=>conditionMatches(q.showIf,answers));
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
