(function(){
  try {
    document.title = 'Morf 4.1';
    document.querySelectorAll('.eyebrow').forEach(function(el){ el.textContent = 'Version 4.1'; });
    window.MorfBuild = '4.1-tilde-full';
  } catch(err) {}
})();
