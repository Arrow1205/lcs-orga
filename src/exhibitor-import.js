// Les valeurs internes restent compatibles avec les fiches des éditions précédentes.
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function vendorType(value) {
 const text = normalize(value);
 return /partenaire|partner|sponsor/.test(text) ? 'Partenaire'
  : /collectionneur|particulier/.test(text) ? 'Collectionneur'
  : /artiste|artist/.test(text) ? 'Artiste'
  : /\bpro\b|professionnel/.test(text) ? 'Pro' : 'À définir';
}
export const vendorLabel = value => value === 'Collectionneur' ? 'Particulier' : value;
export function tableCount(value, fallback = 1) {
 const count = Number(String(value ?? '').trim().replace(',', '.'));
 return Number.isInteger(count) && count >= 1 ? count : Math.max(1, Math.floor(Number(fallback) || 1));
}
export function exhibitorAmount(type, tables, settings) {
 if (type === 'Partenaire') return Math.round(Math.max(0, Number(settings.exhibitorPartnerPrice ?? 1500) || 0) * 100) / 100;
 const key = {Pro: 'proTablePrice', Collectionneur: 'collectorTablePrice', Artiste: 'artistTablePrice'}[type];
 return key ? Math.round(Math.max(0, Number(settings[key]) || 0) * tableCount(tables) * 100) / 100 : null;
}
export function importMapping(headers) {
 const aliases = {
  vendorType: ['Type', 'Type de vendeur', 'Statut vendeur', 'Tu es un(e)'],
  last: ['Nom participant', 'Nom'], first: ['Prénom participant', 'Prénom'],
  company: ['Société', 'Raison sociale', 'Société / pseudo', 'Nom de Société ou Pseudo', 'Pseudo', 'Entreprise'],
  phone: ['Téléphone', 'Telephone participant', 'Numéro de téléphone', 'Mobile', 'Tel'],
  email: ['eMail', 'Mail', 'adresse eMail', 'Email participant', 'Email payeur'],
  tables: ['Nbre TABLES ?', 'Nombre de tables', 'Nb tables', 'Nbre tables', 'Tables', 'Quantité'],
  community: ['Quel sport ? Quelle communauté (Pokemon, Magic, Yugi-Oh! ...)', 'Sport', 'Communauté'],
  order: ['Référence commande', 'Référence de commande'], ticket: ['Numéro de billet', 'Identifiant billet'],
  rate: ['Tarif', 'Formule'], amount: ['Montant tarif', 'Montant du tarif'], status: ['Statut de la commande', 'Statut']
 };
 // Priorité des alias : « Type » prévaut sur la colonne secondaire « Tu es un(e) ».
 return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, values.reduce((found, value) => found >= 0 ? found : headers.findIndex(h => normalize(h) === normalize(value)), -1)]));
}
export function exhibitorIdentity(row) {
 const name = normalize([row.first, row.last].filter(Boolean).join(' '));
 const company = normalize(row.company), email = normalize(row.email);
 if (!name && !company && !email) return '';
 return JSON.stringify([name, email, company]);
}
export function exhibitorSourceKey(row) {
 if (row.ticket) return 'ticket:' + row.ticket;
 if (row.order) return 'order:' + row.order + '|' + normalize(row.first + ' ' + row.last) + '|' + normalize(row.rate);
 const identity = exhibitorIdentity(row);
 return identity ? 'csv:' + identity : '';
}
