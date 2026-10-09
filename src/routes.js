export const routes={dashboard:'vue-ensemble',salon:'le-salon',exhibitors:'exposants',partners:'partenaires',contacts:'contacts',vip:'vip',tasks:'taches-planning',mytasks:'mes-taches',wall:'mur-echange',animations:'planning-animations',posts:'communication',expenses:'deco-budget',ideas:'idees',assets:'assets',forecast:'previsionnel',invoices:'factures-devis',bilan:'bilan',surveys:'feedback',settings:'reglages'};
export function viewForPath(path){const slug=String(path||'/').replace(/^\/+|\/+$/g,'');return Object.keys(routes).find(k=>routes[k]===slug)||'dashboard'}
export function pathForView(view,year){const path='/'+(routes[view]||routes.dashboard);return year?path+'?year='+Number(year):path}
export function yearFromQuery(search){const year=new URLSearchParams(search).get('year');return year&&/^[0-9]{4}$/.test(year)?Number(year):null}
export function surveyLink(type,year){return `/formulaire/${type}.html?year=${Number(year)}`}
