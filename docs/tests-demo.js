const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({viewport:{width:1280,height:1000}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.goto('file:///home/user/TeacherWatch/demo/teacherwatch-demo.html');
  await p.waitForTimeout(600);
  if (errs.length) { console.log('ERREURS AU CHARGEMENT: '+errs.join(' | ')); }
  const T=async(l,f)=>{try{await f();console.log('OK   '+l);}catch(e){console.log('ÉCHEC '+l+' — '+e.message.split('\n')[0]);}};

  await T('la liste déroulante affiche les noms réels', async()=>{
    const t = await p.locator('#sel-role').textContent();
    if(!/NGO MBOUM/.test(t)) throw new Error('proviseur absent: '+t.slice(0,120));
    if(!/OKOUA|NOLBA|MFOUT|ENGOME/.test(t)) throw new Error('aucun surveillant nommé: '+t.slice(0,160));
  });
  await T('les rôles sont indiqués', async()=>{
    const t = await p.locator('#sel-role').textContent();
    for (const r of ['Proviseur','Administrateur délégué','Surveillant de secteur'])
      if(!t.includes(r)) throw new Error('manque '+r);
  });
  await T('un secteur sans surveillant est signalé sur le tableau de bord', async()=>{
    const t = await p.textContent('.tuiles'); if(!/aucun surveillant/.test(t)) throw new Error('non signalé');
  });
  await T('onglet « Comptes et surveillants » présent', async()=>{
    if(!await p.locator('#onglets button[data-vue="utilisateurs"]').count()) throw new Error('absent');
  });
  await p.click('#onglets button[data-vue="utilisateurs"]'); await p.waitForTimeout(400);
  await T('avertissement secteur vacant', async()=>{
    const t=await p.textContent('main'); if(!/sans surveillant/.test(t)) throw new Error('absent'); });
  await T('les 6 comptes initiaux sont listés', async()=>{
    const n=await p.locator('.carte:has(h2:has-text("Comptes")) tbody tr').count();
    if(n<6) throw new Error(n+' lignes'); });
  await T('le compte principal est protégé', async()=>{
    const t=await p.textContent('.carte:has(h2:has-text("Comptes")) tbody');
    if(!/compte principal/.test(t)) throw new Error('marqueur absent');
    if(!/Protégé/.test(t)) throw new Error('mention de protection absente'); });

  // créer un surveillant pour le secteur vacant
  await p.fill('#u-nom','MBALLA Jean Pierre');
  await p.selectOption('#u-role','surveillant');
  const optSel = await p.locator('#u-sect').inputValue();
  console.log('     secteur proposé par défaut (vacant) :', optSel);
  await p.click('#u-creer'); await p.waitForTimeout(400);
  await T('création confirmée avec l’état Invité', async()=>{
    const t=await p.textContent('#dlg-form');
    if(!/Compte créé/.test(t)) throw new Error(t.slice(0,80));
    if(!/Invité/.test(t)) throw new Error('état invité non mentionné'); });
  await p.click('#dlg-form button.act'); await p.waitForTimeout(300);
  await T('le nouveau compte apparaît dans la liste déroulante', async()=>{
    const t=await p.locator('#sel-role').textContent();
    if(!/MBALLA Jean Pierre/.test(t)) throw new Error('absent'); });
  await T('plus de secteur sans surveillant', async()=>{
    await p.click('#onglets button[data-vue="suivi"]'); await p.waitForTimeout(300);
    const t=await p.textContent('.tuiles'); if(/aucun surveillant/.test(t)) throw new Error('encore signalé'); });

  // essayer de retirer le compte principal
  await p.click('#onglets button[data-vue="utilisateurs"]'); await p.waitForTimeout(400);
  await T('aucun bouton de retrait sur le compte principal', async()=>{
    const lignePrincipale = p.locator('tr:has(.jum:has-text("compte principal"))');
    if(await lignePrincipale.locator('button[data-statut]').count()) throw new Error('bouton présent'); });

  // suspendre un surveillant avec motif
  const btnSusp = p.locator('tr:has-text("Surveillant de secteur") button[data-statut$="|suspendu"]').first();
  await btnSusp.click(); await p.waitForTimeout(300);
  await T('la suspension exige un motif', async()=>{
    await p.click('#ok-m'); await p.waitForTimeout(200);
    if(!await p.locator('#dlg[open]').count()) throw new Error('validée sans motif'); });
  await p.fill('#m-motif','congé annuel'); await p.click('#ok-m'); await p.waitForTimeout(400);
  await T('statut passé à Suspendu', async()=>{
    const t=await p.textContent('.carte:has(h2:has-text("Comptes")) tbody');
    if(!/Suspendu/.test(t)) throw new Error('non'); });

  // un administrateur délégué ne peut pas gérer les administrateurs
  const optAdmin = await p.evaluate(()=>[...document.querySelectorAll('#sel-role option')]
    .find(o=>/Administrateur délégué/.test(o.textContent)).value);
  await p.selectOption('#sel-role', optAdmin); await p.waitForTimeout(400);
  await p.click('#onglets button[data-vue="utilisateurs"]'); await p.waitForTimeout(400);
  await T('l’admin ne peut pas créer d’administrateur', async()=>{
    const t=await p.locator('#u-role').textContent();
    if(/Administrateur/.test(t)) throw new Error('option offerte');
    const m=await p.textContent('main');
    if(!/Seul le proviseur peut créer/.test(m)) throw new Error('explication absente'); });
  await T('l’admin ne peut pas toucher au compte proviseur', async()=>{
    const t=await p.textContent('.carte:has(h2:has-text("Comptes")) tbody');
    if(!/Réservé au proviseur/.test(t)) throw new Error('non protégé'); });

  // transfert réservé au proviseur
  await T('pas de transfert du compte principal pour l’admin', async()=>{
    if(await p.locator('#f-transfert').count()) throw new Error('formulaire visible'); });
  const optProv = await p.evaluate(()=>[...document.querySelectorAll('#sel-role option')]
    .find(o=>/— Proviseur/.test(o.textContent)).value);
  await p.selectOption('#sel-role', optProv); await p.waitForTimeout(400);
  await p.click('#onglets button[data-vue="utilisateurs"]'); await p.waitForTimeout(400);
  await T('le proviseur voit le transfert du compte principal', async()=>{
    if(!await p.locator('#f-transfert').count()) throw new Error('absent'); });

  // audit
  await p.click('#onglets button[data-vue="audit"]'); await p.waitForTimeout(400);
  await T('audit : création et suspension tracées avec motif', async()=>{
    const t=await p.textContent('main');
    if(!/creation compte/.test(t)) throw new Error('création absente');
    if(!/changement statut compte/.test(t)) throw new Error('suspension absente');
    if(!/congé annuel/.test(t)) throw new Error('motif absent'); });
  await p.setViewportSize({width:390,height:860});
  await p.click('#onglets button[data-vue="utilisateurs"]'); await p.waitForTimeout(400);
  await T('pas de débordement horizontal sur mobile', async()=>{
    const o=await p.evaluate(()=>document.body.scrollWidth-window.innerWidth);
    if(o>2) throw new Error('dépassement '+o+'px'); });
  await p.screenshot({path:'/tmp/claude-0/-home-user-TeacherWatch/0ef88542-7778-58cd-abfc-04a16198f1f7/scratchpad/v-comptes-mobile.png'});
  await p.setViewportSize({width:1280,height:1100});
  await p.waitForTimeout(300);
  await p.screenshot({path:'/tmp/claude-0/-home-user-TeacherWatch/0ef88542-7778-58cd-abfc-04a16198f1f7/scratchpad/v-comptes.png'});
  console.log(errs.length?'\nERREURS: '+errs.slice(0,5).join(' | '):'\naucune erreur JS');
  await b.close();
})();
