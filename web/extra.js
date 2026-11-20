(function(){
  var d=document,q=function(s){return d.querySelector(s)},vis=function(e){return e&&!e.hidden};

  // حذف دکمه‌های صفحهٔ اصلی
  ['enTalk','enWrite'].forEach(function(id){var e=d.getElementById(id);if(e)e.remove()});
  function rmOv(){d.querySelectorAll('.ovbtn').forEach(function(e){e.remove()})}
  rmOv();
  var mo=new MutationObserver(rmOv);mo.observe(d.body,{childList:true,subtree:true});
  setTimeout(function(){mo.disconnect()},15000);

  // ظاهر دکمه‌های بازگشت
  var st=d.createElement('style');
  st.textContent='.backtxt{width:auto!important;padding:0 12px;font-size:.9rem!important;font-weight:700;color:var(--gold)!important}'
   +'.modal-back{position:absolute;top:10px;right:10px;border:0;background:transparent;color:var(--gold);font:inherit;font-size:.88rem;font-weight:700;padding:8px 10px;border-radius:12px;z-index:2}'
   +'.chat-back{border:0;background:transparent;color:var(--gold);font:inherit;font-size:.9rem;font-weight:700;padding:8px 10px;border-radius:12px}'
   +'.chat-back[hidden]{display:none!important}';
  d.head.appendChild(st);

  // یک مرحله عقب رفتن
  window.khBack=function(){
    var tour=q('#tourView');if(vis(tour)){var b1=q('#tSkip');if(b1)b1.click();return true}
    var sl=q('#searchLayer');if(vis(sl)){var b2=q('#searchClose');if(b2)b2.click();return true}
    var ml=q('#modalLayer');if(vis(ml)){var b3=q('#modalClose');if(b3)b3.click();return true}
    var hp=q('#histPage');if(vis(hp)){hp.hidden=true;return true}
    var sp=q('#setPage');if(vis(sp)){sp.hidden=true;return true}
    var sb=q('#sidebar');if(sb&&sb.classList.contains('open')){var b4=q('#closeMenu');if(b4)b4.click();return true}
    var w=q('#welcome');if(w&&w.hidden){var b5=q('#newChat');if(b5)b5.click();return true}
    return false;
  };
  function mk(txt,cls){var b=d.createElement('button');b.type='button';b.className=cls;b.textContent=txt;return b}

  // صفحه‌های تاریخچه و تنظیمات
  ['hBack','sBack'].forEach(function(id){var b=d.getElementById(id);if(b){b.textContent='→ بازگشت';b.classList.add('backtxt')}});

  // پنجره‌ها
  [['#modalLayer .modal','#modalClose'],['#searchLayer .modal','#searchClose']].forEach(function(p){
    var box=q(p[0]),cb=q(p[1]);if(!box||!cb)return;
    var b=mk('→ بازگشت','modal-back');b.addEventListener('click',function(){cb.click()});box.prepend(b);
  });

  // صفحهٔ گفتگو
  var top=q('.topbar'),title=q('.top-title'),w=q('#welcome');
  if(top&&title){
    var cb2=mk('→ بازگشت','chat-back');cb2.hidden=true;top.insertBefore(cb2,title);
    cb2.addEventListener('click',function(){var n=q('#newChat');if(n)n.click()});
    var upd=function(){cb2.hidden=!(w&&w.hidden)};
    if(w)new MutationObserver(upd).observe(w,{attributes:true,attributeFilter:['hidden']});
    upd();
  }

  // دکمهٔ برگشت خود گوشی
  try{
    history.pushState({kh:1},'');
    window.addEventListener('popstate',function(){if(window.khBack())history.pushState({kh:1},'')});
  }catch(e){}
})();

// تلاش دوباره + نمایش کد خطا برای عیب‌یابی
(function(){
  var of=window.fetch;
  function toast(t){
    var e=document.getElementById('khDbg');
    if(!e){e=document.createElement('div');e.id='khDbg';
      e.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:#222;color:#fff;font:12px sans-serif;padding:8px 10px;border-radius:10px;direction:ltr;text-align:left';
      document.body.appendChild(e);}
    e.textContent=t;clearTimeout(e._t);e._t=setTimeout(function(){e.remove()},12000);
  }
  window.fetch=function(u,o){
    if(typeof u==='string'&&u.indexOf('/api/chat')>-1){
      var n=0;
      var go=function(){
        var c=new AbortController();
        var t=setTimeout(function(){c.abort()},30000);
        return of(u,Object.assign({},o,{signal:c.signal})).then(function(r){
          clearTimeout(t);
          if(!r.ok){
            r.clone().json().then(function(j){toast('HTTP '+r.status+' '+((j&&j.error)||''))}).catch(function(){toast('HTTP '+r.status)});
            if(r.status>=500&&n<2){n++;return go()}
          }
          return r;
        }).catch(function(e){
          clearTimeout(t);
          if(n<2){n++;return go()}
          toast('NETWORK '+((e&&e.name)||'error'));
          throw e;
        });
      };
      return go();
    }
    return of.apply(this,arguments);
  };
})();
