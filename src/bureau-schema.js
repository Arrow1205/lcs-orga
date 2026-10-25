export const bureauCategories=['Organisation & préparation','Équipe & bénévoles','Salle & logistique','Affluence & visiteurs','Exposants & partenaires','Communication & finances','Bilan & perspectives 2027'];
const labels=[
'Avons-nous suffisamment anticipé la préparation du salon (planning, délais, matériel, prestataires, imprévus) ?',
'La répartition des rôles et des responsabilités au sein de l’organisation était-elle claire et efficace ?',
'Quels ont été les principaux problèmes organisationnels avant, pendant et après l’événement ?',
'Avions-nous suffisamment de bénévoles, aux bons endroits et aux bons moments (installation, accueil, surveillance, démontage) ?',
'La charge de travail était-elle bien répartie ou certaines personnes ont-elles dû compenser les manques ?',
'Qu’aurions-nous pu mieux organiser pour faciliter le travail de l’équipe et réduire le stress ?',
'La salle, sa superficie et son implantation étaient-elles adaptées au nombre de visiteurs et d’exposants ?',
'L’installation, la gestion du matériel, les livraisons et le démontage se sont-ils déroulés efficacement ?',
'La circulation, la signalétique, les espaces de repos et les équipements étaient-ils satisfaisants ?',
'L’affluence a-t-elle répondu à nos attentes, et comment s’est-elle répartie au fil de la journée et entre les communautés ?',
'L’accueil, les files d’attente, les accès VIP/Early Access et la gestion des flux étaient-ils efficaces ?',
'Quelle expérience avons-nous réellement offerte aux visiteurs (ambiance, animations, confort, restauration, satisfaction) ?',
'Les exposants étaient-ils satisfaits de leur emplacement, de l’organisation, de l’affluence et de leurs ventes ?',
'Avons-nous proposé une offre suffisamment attractive et équilibrée entre professionnels, particuliers et communautés ?',
'Nos partenaires et sponsors ont-ils apporté une réelle valeur au salon, et avons-nous respecté nos engagements ?',
'Notre communication avant, pendant et après le salon a-t-elle été efficace pour attirer et informer les visiteurs ?',
'Le résultat financier est-il satisfaisant, et quelles dépenses ou recettes méritent d’être optimisées ?',
'Quels sont les trois plus grands succès du salon que nous devons absolument conserver ?',
'Quels sont les trois principaux échecs ou points faibles que nous devons impérativement corriger ?',
'Sommes-nous prêts à organiser un salon plus grand en 2027, et quelles sont les conditions indispensables pour y parvenir ?'];
export const bureauQuestions=labels.map((label,i)=>{const n=i+1,kind=[3,6,18,19,20].includes(n)?'text':[7,12,13,15,17].includes(n)?'choice':'rating',group=n<=3?0:n<=6?1:n<=9?2:n<=12?3:n<=15?4:n<=17?5:6;return {key:'bureau_q'+n,label,kind,category:bureauCategories[group],required:true,...(kind==='choice'?{options:n===12?['Ambiance','Animations','Confort','Restauration','Satisfaction']:n===7?['Oui','Non']:['Oui','Non','En partie']}:{})}});
