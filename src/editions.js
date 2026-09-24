export function mountEditions({host,years,selected,canCreate,onSelect,onCreate,canLeave=()=>true}){
 host.replaceChildren();host.className='edition-picker';
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='LCS '+selected+' ▾';summary.setAttribute('aria-label','Choisir une année, édition '+selected);details.append(summary);
 const menu=document.createElement('div');menu.className='edition-menu';
 const label=document.createElement('p');label.textContent='Éditions du salon';menu.append(label);
 for(const year of [...years].sort((a,b)=>b-a)){
  const button=document.createElement('button');button.type='button';button.className='edition-option';button.textContent='LCS '+year+(year===selected?' · sélectionnée':'');button.setAttribute('aria-pressed',String(year===selected));
  button.onclick=()=>{if(year===selected){details.open=false;return;}if(canLeave()){details.open=false;onSelect(year);}};menu.append(button);
 }
 if(canCreate){
  const form=document.createElement('form');form.className='edition-create';
  const field=document.createElement('label');field.textContent='Nouvelle année';const input=document.createElement('input');input.type='number';input.min='2000';input.max='2200';input.step='1';input.required=true;input.value=String(Math.max(...years)+1);input.setAttribute('aria-label','Année à créer');field.append(input);
  const button=document.createElement('button');button.type='submit';button.textContent='+ Ajouter une année';button.className='btn primary';
  const message=document.createElement('p');message.setAttribute('role','status');
  form.append(field,button,message);form.onsubmit=async e=>{e.preventDefault();const year=Number(input.value);if(!Number.isInteger(year)||year<2000||year>2200){message.textContent='Saisis une année entre 2000 et 2200.';return;}if(years.includes(year)){message.textContent='Cette édition existe déjà.';return;}if(!canLeave())return;
   button.disabled=true;input.disabled=true;message.textContent='Création…';try{await onCreate(year);}catch(error){message.textContent=error.message;button.disabled=false;input.disabled=false;}
  };menu.append(form);
 }
 const hint=document.createElement('p');hint.className='edition-hint';hint.textContent='Seuls les contacts sont partagés entre les années.';menu.append(hint);details.append(menu);host.append(details);
 details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus();}});
}
