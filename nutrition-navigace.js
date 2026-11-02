/* Nutrition Coach: plovoucí navigace, bez změn dat nebo výpočtů */
(() => {
  'use strict';
  const init = () => {
    if (document.getElementById('ncQuickNav')) return;
    const sections = [
      ['Cíle dne', 'Cíle dne'],
      ['Přidat jídlo', 'Přidat jídlo'],
      ['Jídelníček', 'Jídelníček aktuálního typu dne'],
      ['Recepty', 'Recepty'],
      ['Generátor', 'Automatický generátor jídelníčku'],
      ['Moje jídelníčky', 'Jídelníčky'],
      ['Vlastní potravina', 'Vlastní potravina']
    ];
    const cards = [...document.querySelectorAll('main h2')];
    const targets = sections.map(([label, title], i) => {
      const heading = cards.find(h => h.textContent.trim() === title);
      const target = heading?.closest('section') || heading;
      if (!target || target.closest('[aria-hidden="true"]')) return null;
      if (!target.id) target.id = 'nc-nav-' + i;
      target.style.scrollMarginTop = '20px';
      return {label, target};
    }).filter(Boolean);
    const style = document.createElement('style');
    style.textContent = `
      #ncQuickNav{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:9998;font-family:inherit}
      #ncQuickNav button,#ncQuickNav a{font:inherit}
      #ncQuickNav .nc-toggle{width:56px;height:56px;border:1px solid rgba(255,255,255,.25);border-radius:18px;background:#1a8c85;color:#fff;box-shadow:0 8px 30px #0008;font-size:26px;cursor:pointer}
      #ncQuickNav .nc-menu{position:absolute;bottom:68px;right:0;width:min(310px,calc(100vw - 32px));max-height:min(68vh,600px);overflow-y:auto;background:#102538;color:#f3f8fb;border:1px solid #426174;border-radius:18px;padding:12px;box-shadow:0 14px 45px #000a}
      #ncQuickNav .nc-menu[hidden]{display:none!important}
      #ncQuickNav .nc-title{font-weight:800;font-size:15px;margin:4px 8px 10px}
      #ncQuickNav .nc-item{display:block;width:100%;box-sizing:border-box;text-align:left;padding:12px 14px;margin:3px 0;border:0;border-radius:11px;background:transparent;color:#f2f8fc;text-decoration:none;cursor:pointer;font-size:14px}
      #ncQuickNav .nc-item:hover,#ncQuickNav .nc-item:focus-visible{background:#214a5d;outline:2px solid transparent}
      #ncQuickNav .nc-catalog{background:#1b625f;font-weight:700}
      .nc-catalog-footer{margin:26px 0 95px;padding:22px;text-align:center;border:1px solid #3d6972;border-radius:18px;background:#102c3a;color:#e9f9fb}
      .nc-catalog-footer a{display:inline-block;padding:13px 22px;border-radius:12px;background:#178d86;color:white;text-decoration:none;font-weight:750}
      .nc-catalog-footer p{margin:0 0 14px;color:#bcd4dd}
      @media(max-width:600px){#ncQuickNav{right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))}#ncQuickNav .nc-toggle{width:52px;height:52px}}
    `;
    document.head.append(style);
    const dock = document.createElement('nav');
    dock.id = 'ncQuickNav';
    dock.setAttribute('aria-label','Rychlá navigace Nutrition Coach');
    const menu = document.createElement('div');
    menu.className = 'nc-menu'; menu.id = 'ncQuickNavMenu'; menu.hidden = true;
    const title = document.createElement('div');title.className='nc-title';title.textContent='Přejít na sekci';menu.append(title);
    const close = () => {menu.hidden=true; toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';};
    for (const {label,target} of targets) {
      const btn=document.createElement('button');btn.type='button';btn.className='nc-item';btn.textContent=label;
      btn.addEventListener('click',()=>{close();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
      menu.append(btn);
    }
    const catalog = document.createElement('a');catalog.href='potraviny.html';catalog.className='nc-item nc-catalog';catalog.textContent='📚 Katalog všech potravin';menu.append(catalog);
    const top = document.createElement('button');top.type='button';top.className='nc-item';top.textContent='↑ Zpět nahoru';
    top.addEventListener('click',()=>{close();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});menu.append(top);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='nc-toggle';toggle.textContent='☰';toggle.setAttribute('aria-label','Otevřít rychlou navigaci');toggle.setAttribute('aria-controls',menu.id);toggle.setAttribute('aria-expanded','false');
    toggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';});
    document.addEventListener('click',e=>{if(!dock.contains(e.target))close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    dock.append(menu,toggle);document.body.append(dock);
    const main=document.querySelector('main');
    if(main&&!document.getElementById('ncCatalogFooter')){
      const footer=document.createElement('section');footer.id='ncCatalogFooter';footer.className='nc-catalog-footer';
      const p=document.createElement('p');p.textContent='Prohlédni si všechny potraviny přehledně podle kategorií, včetně nutričních hodnot.';
      const a=document.createElement('a');a.href='potraviny.html';a.textContent='📚 Otevřít katalog potravin →';
      footer.append(p,a);main.append(footer);
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
