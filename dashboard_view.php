<?php
$now=$db->query("SELECT CURDATE() hoy,HOUR(NOW()) hora")->fetch_assoc();$hoy=$now['hoy'];
$items=array_map(fn($r)=>['dias'=>(int)$r['dias'],'cantidad'=>(int)$r['cantidad']]+$r,$db->query("SELECT id,producto,codigo,categoria,proveedor,lote,cantidad,tiene_cambio,fecha_cambio,vencimiento,COALESCE(producto_origen_id,id) grupo,DATEDIFF(vencimiento,CURDATE()) dias FROM productos ORDER BY vencimiento,producto")->fetch_all(MYSQLI_ASSOC));
$changes=$db->query("SELECT id,producto,vencimiento,DATEDIFF(vencimiento,CURDATE()) dias FROM productos WHERE tiene_cambio=1 AND vencimiento>=CURDATE() AND fecha_cambio<=CURDATE() ORDER BY vencimiento");
$units=fn(array $rows):int=>array_sum(array_column($rows,'cantidad'));
$expired=array_filter($items,fn($r)=>$r['dias']<0);
$soon=array_filter($items,fn($r)=>$r['dias']>=0&&$r['dias']<=DIAS_PROXIMO);
$good=array_filter($items,fn($r)=>$r['dias']>DIAS_PROXIMO);
$total=count(array_unique(array_column($items,'grupo')));
$categories=count(array_unique(array_filter(array_column($items,'categoria'))));
$stock=$units($items);
$week=count(array_filter($soon,fn($r)=>$r['dias']<=7));
$tone=fn(int $d)=>$d<=DIAS_CRITICO?'crit':($d<=DIAS_PROXIMO?'warn':'ok');
$label=fn(int $d)=>$d<0?'Vencido':($d<=DIAS_CRITICO?'Crítico':($d<=DIAS_PROXIMO?'Próximo':'En buen estado'));
$months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
$short=fn(string $date)=>(int)substr($date,8,2).' '.$months[(int)substr($date,5,2)-1];
$addDays=fn(int $n)=>date('Y-m-d',strtotime("$hoy +$n day"));
$plural=fn(int $n,string $one,string $many)=>$n.' '.($n===1?$one:$many);
$weekdays=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
$greeting=$now['hora']<12?'Buenos días':($now['hora']<19?'Buenas tardes':'Buenas noches');
$headline=$week||$expired?$plural($week,'producto vence','productos vencen').' esta semana y '.$plural(count($expired),'ya venció','ya vencieron').'.':'Nada vence esta semana. Todo en orden.';
// Calendario: unidades que vencen cada día durante los próximos 30 días
$runway=array_fill(0,31,[]);foreach($soon+$good as $r)if($r['dias']<=30)$runway[$r['dias']][]=$r;
$runMax=max(1,...array_map($units,$runway));
$parts=[['En buen estado','ok',$units($good)],['Próximos a vencer','warn',$units($soon)],['Vencidos','crit',$units($expired)]];
$icon=['box'=>'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>','clock'=>'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>','alert'=>'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>','stock'=>'<path d="M4 7h16v13H4zM8 7V4h8v3"/>','plus'=>'<path d="M12 5v14M5 12h14"/>','user'=>'<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M19 8v6M16 11h6"/>','history'=>'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>','list'=>'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>','search'=>'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'];
$svg=fn(string $name,string $width='2')=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'.$width.'">'.$icon[$name].'</svg>';
?>
<div class="dash">
<div class="top"><div><div class="eyebrow">Control de vencimientos · <?=e($weekdays[(int)date('w',strtotime($hoy))].' '.(int)substr($hoy,8,2).' de '.$months[(int)substr($hoy,5,2)-1])?></div><h1><?=e($greeting.', '.$_SESSION['user'])?></h1><p><?=e($headline)?></p></div><div class="tools"><form class="dsearch" role="search"><?=$svg('search')?><input type="hidden" name="page" value="productos"><input name="q" placeholder="Buscar producto…" aria-label="Buscar producto"></form><a class="btn" href="?page=productos"><?=$svg('plus','2.4')?>Nuevo producto</a></div></div>
<?php if($changes->num_rows):?><section class="change-notice"><strong>Productos que deben solicitar cambio</strong><div><?php while($c=$changes->fetch_assoc()):?><span><?=e($c['producto'])?> · vence en <?=e($c['dias'])?> días</span><?php endwhile?></div><a href="?page=productos">Revisar productos</a></section><?php endif?>
<section class="kpis" aria-label="Resumen">
 <a class="kpi t-info" href="?page=productos"><div class="kpi-head"><span class="kpi-label">Productos registrados</span><span class="kpi-ico"><?=$svg('box')?></span></div><div class="kpi-val"><?=e($total)?></div><div class="kpi-sub"><span><?=e($plural($categories,'categoría','categorías'))?></span><b>Ver →</b></div></a>
 <a class="kpi t-warn" href="?page=productos"><div class="kpi-head"><span class="kpi-label">Próximos a vencer</span><span class="kpi-ico"><?=$svg('clock')?></span></div><div class="kpi-val"><?=e(count($soon))?></div><div class="kpi-sub"><span>en <?=DIAS_PROXIMO?> días o menos</span><b>Ver →</b></div></a>
 <a class="kpi t-crit" href="?page=productos"><div class="kpi-head"><span class="kpi-label">Vencidos</span><span class="kpi-ico"><?=$svg('alert')?></span></div><div class="kpi-val"><?=e(count($expired))?></div><div class="kpi-sub"><span>pendientes de baja</span><b>Ver →</b></div></a>
 <a class="kpi t-ok" href="?page=productos"><div class="kpi-head"><span class="kpi-label">Unidades en stock</span><span class="kpi-ico"><?=$svg('stock')?></span></div><div class="kpi-val"><?=e(number_format($stock,0,',','.'))?></div><div class="kpi-sub"><span><?=e($units($soon))?> en riesgo</span><b>Ver →</b></div></a>
</section>
<section class="dpanel"><div class="dpanel-head"><div><h2>Calendario de vencimientos · próximos 30 días</h2><p>Unidades que vencen cada día. Pasa el cursor por una barra para ver el detalle.</p></div></div>
 <div><div class="runway"><?php foreach($runway as $i=>$day):$u=$units($day);?><div class="day<?=$u?'':' empty'?><?=$i<6?' l':($i>24?' r':'')?>" style="--c:var(--<?=$tone($i)?>)"><span class="tip"><?=e($short($addDays($i)))?> · <?=$u?e($u).' u.':'sin vencimientos'?><?php foreach($day as $r):?><br><?=e($r['producto'])?><?php endforeach?></span><i style="height:<?=$u?max(6,round($u/$runMax*100)):2?>%"></i></div><?php endforeach?></div>
 <div class="runway-axis"><?php for($i=0;$i<=30;$i++):?><span><?=$i===0?'Hoy':($i%5===0?(int)substr($addDays($i),8,2):'')?></span><?php endfor?></div></div>
 <div class="zones"><span style="--c:var(--crit)"><i></i>Crítico · 0–<?=DIAS_CRITICO?> días</span><span style="--c:var(--warn)"><i></i>Próximo · <?=DIAS_CRITICO+1?>–<?=DIAS_PROXIMO?> días</span><span style="--c:var(--ok)"><i></i>En buen estado · +<?=DIAS_PROXIMO?> días</span></div>
</section>
<div class="grid-2">
 <section class="dpanel"><div class="dpanel-head"><div><h2>Próximos a vencer</h2><p class="fefo">Orden FEFO: lo primero que vence, sale primero.</p></div><a class="link" href="?page=productos">Ver todos →</a></div>
  <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Vence</th><th>Restan</th><th class="num">Stock</th><th>Estado</th></tr></thead><tbody>
  <?php if(!$soon):?><tr><td colspan="5" class="empty">No hay productos próximos a vencer</td></tr><?php endif?>
  <?php foreach(array_values(array_slice($soon,0,6)) as $i=>$r):$d=$r['dias'];?><tr class="t-<?=$tone($d)?><?=$i?'':' sel'?>" data-detail="<?=$i?>" tabindex="0" aria-controls="detalle-<?=$i?>"><td class="prod"><b><?=e($r['producto'])?></b><small><?=e(implode(' · ',array_filter([$r['lote']?'Lote '.$r['lote']:'',$r['codigo'],$r['categoria']])))?></small></td><td class="mono"><?=e($short($r['vencimiento']))?></td><td><span class="days"><?=$d===0?'Hoy':$d.' d'?></span><div class="bar"><i style="width:<?=max(6,round(100-$d/DIAS_PROXIMO*100))?>%"></i></div></td><td class="num mono"><?=e($r['cantidad'])?></td><td><span class="pill"><?=$label($d)?></span></td></tr><?php endforeach?>
  </tbody></table></div>
 </section>
 <div class="side">
 <?php foreach(array_values(array_slice($soon,0,6)) as $i=>$r):$d=$r['dias'];
  // Línea de tiempo del lote: hoy, fecha para pedir el cambio (si aplica) y vencimiento, en orden
  $points=[['Hoy',$hoy,'now']];if($r['tiene_cambio']&&$r['fecha_cambio'])$points[]=['Pedir cambio al proveedor'.($r['fecha_cambio']<=$hoy?' · ya toca':''),$r['fecha_cambio'],''];$points[]=['Vence',$r['vencimiento'],'end'];usort($points,fn($a,$b)=>strcmp($a[1],$b[1]));
  $provider=trim((string)$r['proveedor']);?>
  <section class="dpanel detail t-<?=$tone($d)?>" id="detalle-<?=$i?>"<?=$i?' hidden':''?> aria-label="Detalle de <?=e($r['producto'])?>">
   <div class="detail-top"><span class="kpi-ico"><?=$svg('box')?></span><div><h2><?=e($r['producto'])?></h2><small><?=e(implode(' · ',array_filter([$r['lote']?'Lote '.$r['lote']:'',$r['codigo'],$r['categoria']])))?></small></div><?php if(count($soon)>1):?><button class="next" type="button" data-next="<?=$i+1?>" aria-label="Siguiente producto">›</button><?php endif?></div>
   <div class="detail-big"><div><div class="detail-label">Restan</div><div class="detail-val"><?=$d===0?'Vence hoy':e($plural($d,'día','días'))?></div></div><span class="pill"><?=$label($d)?></span></div>
   <ol class="timeline"><?php foreach($points as [$text,$date,$cls]):?><li class="<?=$cls?>"><b><?=e($text)?></b><small><?=e($short($date))?></small></li><?php endforeach?></ol>
   <div class="owner"><span class="avatar"><?=e($provider===''?'—':mb_strtoupper(mb_substr($provider,0,2)))?></span><div><b><?=e($provider===''?'Sin proveedor':$provider)?></b><small>Proveedor · <?=e($r['cantidad'])?> unidades</small></div><a class="link" href="?page=productos&amp;q=<?=e(urlencode($r['producto']))?>">Ver →</a></div>
  </section>
 <?php endforeach?>
 <?php if(!$soon):$next=reset($good)?:null;?>
  <section class="dpanel detail t-ok" aria-label="Sin productos próximos a vencer">
   <div class="detail-top"><span class="kpi-ico"><?=$svg('box')?></span><div><h2>Nada por vencer</h2><small>Próximos <?=DIAS_PROXIMO?> días</small></div></div>
   <div class="detail-big"><div><div class="detail-label">Próximo vencimiento</div><div class="detail-val"><?=$next?e('en '.$plural($next['dias'],'día','días')):'Sin productos'?></div></div><span class="pill">Todo en orden</span></div>
   <ol class="timeline"><li class="now"><b>Hoy</b><small><?=e($short($hoy))?></small></li><li><b>Sin vencimientos</b><small>hasta el <?=e($short($addDays(DIAS_PROXIMO)))?></small></li><?php if($next):?><li class="end"><b><?=e($next['producto'])?></b><small><?=e($short($next['vencimiento']))?></small></li><?php endif?></ol>
   <div class="owner"><span class="avatar"><?=$svg('plus','2.4')?></span><div><b><?=$items?'Registra otro vencimiento':'Aún no hay productos'?></b><small>Aparecerán aquí al acercarse su fecha</small></div><a class="link" href="?page=productos">Registrar →</a></div>
  </section>
 <?php endif?>
 <section class="dpanel"><div class="dpanel-head"><div><h2>Estado del inventario</h2><p>Por unidades en stock</p></div></div>
  <div class="big-total"><b><?=e(number_format($stock,0,',','.'))?></b><span>unidades</span></div>
  <div class="split"><?php foreach($parts as [$name,$t,$u]):if($u):?><i style="--c:var(--<?=$t?>);flex:<?=$u?>" title="<?=e("$name: $u")?>"></i><?php endif;endforeach?></div>
  <div class="dlegend"><?php foreach($parts as [$name,$t,$u]):?><div style="--c:var(--<?=$t?>)"><i></i><span><?=$name?></span><b><?=e($u)?></b><small><?=$stock?round($u/$stock*100):0?>%</small></div><?php endforeach?></div>
 </section>
 </div>
</div>
<div class="grid-2">
 <section class="dpanel"><div class="dpanel-head"><div><h2>Productos vencidos</h2><p>Retíralos de la venta y regístralos como merma.</p></div><a class="link crit" href="?page=productos">Ver todos →</a></div>
  <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Venció</th><th>Hace</th><th class="num">Unid.</th><th></th></tr></thead><tbody>
  <?php if(!$expired):?><tr><td colspan="5" class="empty">No hay productos vencidos</td></tr><?php endif?>
  <?php foreach(array_slice(array_reverse($expired),0,6) as $r):?><tr class="t-crit"><td class="prod"><b><?=e($r['producto'])?></b><small><?=e(implode(' · ',array_filter([$r['lote']?'Lote '.$r['lote']:'',$r['codigo'],$r['categoria']])))?></small></td><td class="mono"><?=e($short($r['vencimiento']))?></td><td><span class="days"><?=-$r['dias']?> d</span></td><td class="num mono"><?=e($r['cantidad'])?></td><td class="num"><?php if(admin()):?><form method="post" onsubmit="return confirm('¿Dar de baja este vencimiento?')"><input type="hidden" name="csrf" value="<?=e(csrf())?>"><input type="hidden" name="action" value="product_delete"><input type="hidden" name="id" value="<?=e($r['id'])?>"><input type="hidden" name="volver" value="dashboard"><button class="row-act">Dar de baja</button></form><?php endif?></td></tr><?php endforeach?>
  </tbody></table></div>
 </section>
 <section class="dpanel"><div class="dpanel-head"><h2>Acciones rápidas</h2></div>
  <div class="actions">
   <a class="action t-ok" href="?page=productos"><span class="kpi-ico"><?=$svg('plus','2.2')?></span><span><b>Nuevo producto</b><small>Registrar vencimiento</small></span></a>
   <?php if(admin()):?><a class="action t-info" href="?page=usuarios"><span class="kpi-ico"><?=$svg('user')?></span><span><b>Nuevo usuario</b><small>Dar acceso</small></span></a>
   <a class="action t-warn" href="?page=historial"><span class="kpi-ico"><?=$svg('history')?></span><span><b>Historial</b><small>Ver movimientos</small></span></a><?php endif?>
   <a class="action t-crit" href="?page=productos"><span class="kpi-ico"><?=$svg('list')?></span><span><b>Ver inventario</b><small>Consultar y editar</small></span></a>
  </div>
 </section>
</div>
<footer>© 2026 Control de Vencimientos · VENCE+</footer>
</div>
