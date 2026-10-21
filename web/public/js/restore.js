// Muestra al instante la última versión guardada de la sección (se actualiza sola al llegar los datos)
try {
  var saved = sessionStorage.getItem('page:' + location.pathname + location.search);
  if (saved) { var root = document.getElementById('page'); root.innerHTML = saved; root.classList.add('stale'); }
} catch (error) { /* sin datos guardados */ }
