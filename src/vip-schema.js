export const vipQuestions=[
 {key:'vip_ticket',label:'Quel billet avais-tu ?',kind:'choice',options:['VIP','Early Access'],required:true},
 {key:'vip_bag',label:'Quelle note donnerais-tu à la qualité du sac VIP ?',kind:'rating10',hint:'Note de 0 à 10.',required:true,showIf:{key:'vip_ticket',equals:'VIP'}},
 {key:'vip_price',label:'Comment évalues-tu le prix payé pour l’accès anticipé ?',kind:'choice',options:['Bon rapport qualité/prix','Trop cher'],required:true},
 {key:'vip_duration',label:'Comment évalues-tu la durée de l’accès anticipé ?',kind:'choice',options:['Beaucoup trop courte','Un peu trop courte','Adaptée','Un peu trop longue','Beaucoup trop longue'],required:true},
 {key:'vip_community_pack',label:'Serais-tu intéressé·e par un pack VIP dédié à ta communauté ?',kind:'choice',options:['Oui','Non'],required:true}
];
export function duplicateVisitorForVip(visitorQuestions){
 if(visitorQuestions.some(q=>vipQuestions.some(p=>p.key===q.key)))throw Error('Une clé de question VIP existe déjà dans le formulaire visiteur.');
 return structuredClone([...vipQuestions,...visitorQuestions]);
}
