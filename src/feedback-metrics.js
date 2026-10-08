import {normalizeVerbatim} from './feedback-themes.js';
export function returnCounts(values){
 let yes=0,no=0,undecided=0,missing=0;
 for(const value of values){const n=normalizeVerbatim(value);if(!n)missing++;else if(/^oui\b/.test(n))yes++;else if(/^non\b|^probablement pas\b/.test(n))no++;else undecided++;}
 const answered=yes+no;
 return {yes,no,undecided,missing,answered,percent:answered?Math.round(yes/answered*100):null};
}
export function bucketAmount(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
 const text=String(value??'').replace(/[\u00a0\u202f]/g,' ').replace(/(\d)\s+(?=\d{3}\b)/g,'$1').replace(/,/g,'.');
 if(/difficile|prefere|ne sais|pas de reponse/i.test(normalizeVerbatim(text)))return null;
 const nums=[...text.matchAll(/\d+(?:\.\d+)?/g)].map(x=>Number(x[0]));
 if(!nums.length)return null;
 if(/moins|inferieur/.test(normalizeVerbatim(text)))return nums[0]/2;
 if(/plus|superieur/.test(normalizeVerbatim(text))||text.includes('+'))return nums[0];
 return nums.length>1?(nums[0]+nums[1])/2:nums[0];
}
export function meanBuckets(values){
 const known=values.map(bucketAmount).filter(v=>v!==null);
 return {count:known.length,average:known.length?Math.round(known.reduce((a,b)=>a+b,0)/known.length):null};
}
export function gridScore(value,columns=[]){
 const n=Number(value);if(String(value??'').trim()!==''&&Number.isFinite(n)&&n>=1&&n<=5)return n;
 const t=normalizeVerbatim(value);
 const position=columns.findIndex(c=>normalizeVerbatim(c)===t),first=normalizeVerbatim(columns[0]);
 if(position>=0&&columns.length===5&&/tres (in)?confort|tres (in)?satisf|excellent|tres mauvais/.test(first))return /tres confort|tres satisf|excellent/.test(first)?5-position:position+1;
 if(/pas vu|non concerne|ne sais|sans avis/.test(t))return null;
 if(/tres inconfort|tres insatisf|beaucoup trop|tres mauvais/.test(t))return 1;
 if(/inconfort|insatisf|peu confort|peu satisf|mauvais/.test(t))return /un peu|leger|peu/.test(t)?2:1;
 if(/tres confort|tres satisf|excellent/.test(t))return 5;
 if(/assez confort|moyen|neutre|adapte|correct/.test(t))return 3;
 if(/confort|satisf|bien/.test(t))return 4;
 const index=columns.findIndex(c=>normalizeVerbatim(c)===t);
 if(index<0||columns.length!==5)return null;
 return /tres confort|tres satisf|excellent/.test(first)?5-index:index+1;
}
