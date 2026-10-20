<?php require __DIR__.'/report_data.php';
?>
<section class="panel report-form"><form autocomplete="off" class="report-filters"><input type="hidden" name="page" value="reportes">
 <label>Mes<input type="month" name="mes" onchange="this.form.submit()" value="<?=e($mes)?>" required></label>
 <?php if(admin()):?><label>Persona<select name="usuario" onchange="this.form.submit()"><option value="">Todas las personas</option><?php foreach($team as $t):?><option value="<?=e($t['id'])?>"<?=$owner===(int)$t['id']?' selected':''?>><?=e(display_name($t).($t['area']?' · '.$t['area']:''))?></option><?php endforeach?></select></label><?php endif?>
 <label>Mostrar<select name="tipo" onchange="this.form.submit()"><?php foreach($types as $key=>$text):?><option value="<?=$key?>"<?=$key===$tipo?' selected':''?>><?=$text?></option><?php endforeach?></select></label>
 <button>Ver reporte</button><button class="ghost" name="pdf" value="1">Descargar PDF</button>
</form></section>
<article class="report">
 <header class="report-head"><div><b class="report-brand">VENCE<span>+</span></b><h2><?=e($title)?></h2><p class="report-who"><?=e($colaborador)?></p><p><?=e($subtitle)?></p></div><div class="report-meta"><span>Generado el <?=e($now['ahora'])?></span><span>Por <?=e(display_name())?></span></div></header>
 <div class="report-kpis">
  <div><small>Productos</small><b><?=count($rows)?></b></div>
  <div><small>Unidades</small><b><?=e(number_format($units($rows),0,',','.'))?></b></div>
  <div class="t-crit"><small>Vencidos</small><b><?=count($expired)?></b><small><?=e($units($expired))?> unidades</small></div>
  <div class="t-warn"><small>Por vencer</small><b><?=count($rows)-count($expired)?></b><small><?=e($units($rows)-$units($expired))?> unidades</small></div>
 </div>
 <?php if(!$rows):?><p class="report-empty">No hay productos <?=$tipo==='vencidos'?'vencidos':($tipo==='por_vencer'?'por vencer':'que venzan')?> en <?=e($monthName)?>.</p>
 <?php else:?><div class="table"><table><thead><tr><th>Producto</th><th>Proveedor</th><?php if($hasLot):?><th>Lote</th><?php endif?><th class="num">Cant.</th><th>Vence</th><th>Días</th><th>Estado</th><th>Pedir cambio</th></tr></thead><tbody>
 <?php foreach($rows as $r):$d=$r['dias'];?><tr class="t-<?=$tone($d)?>"><td><b><?=e($r['producto'])?></b><?php if($line=implode(' · ',array_filter([$r['categoria'],$showOwner?($r['responsable']?:'Sin responsable'):'']))):?><small><?=e($line)?></small><?php endif?></td><td><?=e($r['proveedor']?:'—')?></td><?php if($hasLot):?><td><?=e($r['lote']?:'—')?></td><?php endif?><td class="num"><?=e($r['cantidad'])?></td><td><?=e($dmy($r['vencimiento']))?></td><td><?=$d<0?'hace '.-$d.' d':($d===0?'Hoy':$d.' d')?></td><td><span class="pill"><?=$label($d)?></span></td><td><?=e($r['tiene_cambio']?$dmy($r['fecha_cambio']):'—')?></td></tr><?php endforeach?>
 </tbody></table></div><?php endif?>
 <footer class="report-foot">Control de Vencimientos · VENCE+ — Estados calculados al <?=e($dmy($hoy))?>.</footer>
</article>
