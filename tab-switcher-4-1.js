// Tiny independent tab switcher. This runs separately from the main app so tabs
    // keep working even if another script hits an error.
    window.MorfSwitchTab = function(tabId){
      var tabs = document.querySelectorAll('.tab[data-tab]');
      var panels = document.querySelectorAll('.panel');
      for(var i = 0; i < tabs.length; i++){
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabId);
        tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-tab') === tabId ? 'true' : 'false');
      }
      for(var j = 0; j < panels.length; j++){
        panels[j].classList.remove('active');
        panels[j].hidden = true;
      }
      var panel = document.getElementById(tabId) || document.getElementById('tab-' + tabId);
      if(panel){
        panel.classList.add('active');
        panel.hidden = false;
      }
      if(tabId === 'dictionary' && typeof window.renderMorfDictionary === 'function') window.renderMorfDictionary();
      try { history.replaceState(null, '', '#' + tabId); } catch(e) {}
      return false;
    };
    window.MorfTabs = { show: window.MorfSwitchTab, bind: function(){} };
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest ? e.target.closest('.tab[data-tab]') : null;
      if(!btn) return;
      e.preventDefault();
      window.MorfSwitchTab(btn.getAttribute('data-tab'));
    });
    document.addEventListener('DOMContentLoaded', function(){
      var panels = document.querySelectorAll('.panel');
      for(var i = 0; i < panels.length; i++){
        if(!panels[i].classList.contains('active')) panels[i].hidden = true;
      }
      var initial = (location.hash || '').replace('#','');
      if(initial && (document.getElementById(initial) || document.getElementById('tab-' + initial))) window.MorfSwitchTab(initial);
    });
