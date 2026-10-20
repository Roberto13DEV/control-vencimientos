<?php
$q=trim((string)($_GET['q']??''));$like="%$q%";
$s=$db->prepare("SELECT p.*,COALESCE(p.producto_origen_id,p.id) grupo,DATEDIFF(p.vencimiento,CURDATE()) dias,u.usuario,u.nombre,u.area FROM productos p LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE (p.producto LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ? OR p.lote LIKE ?) AND ".owner_sql()." ORDER BY p.producto,grupo,p.vencimiento");
$s->bind_param('ssss',$like,$like,$like,$like);$s->execute();
// Un producto con varias fechas de vencimiento se muestra una sola vez y sus fechas se despliegan debajo
$groups=[];foreach($s->get_result()->fetch_all(MYSQLI_ASSOC) as $r)$groups[(int)$r['grupo']][]=$r;
// El administrador puede filtrar por persona para ver solo lo que tiene cada una
$team=admin()?$db->query('SELECT id,usuario,nombre,area FROM usuarios WHERE activo=1 ORDER BY COALESCE(nombre,usuario)')->fetch_all(MYSQLI_ASSOC):[];
// Nombre de la persona filtrada, para explicar una tabla vacía
$filtered=null;foreach($team as $t)if(admin()&&owner()===(int)$t['id'])$filtered=display_name($t);
$cols=admin()?7:6;
$dmy=fn(?string $date)=>date('d/m/Y',strtotime((string)$date));
$meta=fn(array $r)=>implode(' · ',array_filter([(string)$r['codigo'],(string)$r['categoria'],(string)$r['lote']!==''?'Lote '.$r['lote']:'']));
$badge=fn(int $d)=>'<b class="badge '.($d<0?'bad':($d<=DIAS_PROXIMO?'warn':'good')).'">'.($d<0?'Vencido':($d<=DIAS_PROXIMO?'Próximo':'Vigente')).'</b>';
$exchange=function(array $r)use($dmy):string{if(!$r['tiene_cambio'])return 'No';if(!$r['fecha_cambio'])return 'Sí<small class="missing">Falta elegir el día de aviso</small>';return 'Sí<small>Avisar el '.e($dmy($r['fecha_cambio'])).($r['cambio_reportado']?' · reportado':'').'</small>';};
$owner=fn(array $r)=>admin()?'<td><b class="owner-name">'.e(display_name($r)).'</b><small>'.e($r['area']?:'Sin área').'</small></td>':'';
$hidden=fn(string $action,array $r)=>'<input type="hidden" name="csrf" value="'.e(csrf()).'"><input type="hidden" name="action" value="'.$action.'"><input type="hidden" name="id" value="'.e($r['id']).'">';
$exchangeFields=fn(array $r,bool $withDate)=>'<label class="exchange-check"><input type="checkbox" name="tiene_cambio" value="1"'.($r['tiene_cambio']?' checked':'').'> Tiene cambio con proveedor</label><label class="exchange-date">¿Qué día te aviso para pedir el cambio?<input type="date" name="fecha_cambio" value="'.($withDate?e($r['fecha_cambio']):'').'"></label>';
$edit=fn(array $r)=>'<details class="add-expiry"><summary>Editar</summary><form autocomplete="off" method="post" data-title="Editar producto">'.$hidden('product_update',$r).'<label>Producto<input name="producto" value="'.e($r['producto']).'" required></label><label>Categoría<input name="categoria" value="'.e($r['categoria']).'"></label><label>Proveedor<input name="proveedor" value="'.e($r['proveedor']).'"></label><label>Cantidad<input type="number" name="cantidad" min="0" value="'.e($r['cantidad']).'" required></label><label>Vencimiento<input type="date" name="vencimiento" value="'.e($r['vencimiento']).'" required></label>'.$exchangeFields($r,true).'<button>Guardar cambios</button></form></details>';
$add=fn(array $r)=>'<details class="add-expiry"><summary>+ Vencimiento</summary><form autocomplete="off" method="post" data-title="Agregar otro vencimiento a '.e($r['producto']).'">'.$hidden('expiration_add',$r).'<label>Cantidad<input type="number" name="cantidad" min="0" value="0" required></label><label>Nueva fecha<input type="date" name="vencimiento" required></label>'.$exchangeFields($r,false).'<button>Agregar</button></form></details>';
$delete=fn(array $r)=>admin()?'<form autocomplete="off" method="post" class="inline-delete" onsubmit="return confirm(\'¿Eliminar este vencimiento?\')">'.$hidden('product_delete',$r).'<button class="delete">Eliminar</button></form>':'';
?>
<section class="panel"><h2>Nuevo producto</h2><form autocomplete="off" method="post" class="grid-form product-form"><input type="hidden" name="csrf" value="<?=e(csrf())?>"><input type="hidden" name="action" value="product_save"><label class="wide">Producto<input name="producto" required></label><label>Categoría<input name="categoria"></label><label>Proveedor<input name="proveedor"></label><label>Cantidad<input type="number" name="cantidad" min="0" value="0" required></label><label>Vencimiento<input type="date" name="vencimiento" required></label><label class="exchange-check"><input type="checkbox" name="tiene_cambio" value="1"> Tiene cambio con proveedor</label><label class="exchange-date">¿Qué día te aviso para pedir el cambio?<input type="date" name="fecha_cambio"></label><button>Guardar producto</button></form></section>
<section class="panel"><div class="panel-head"><h2>Inventario y vencimientos</h2><form autocomplete="off" class="search"><input type="hidden" name="page" value="productos"><input name="q" value="<?=e($q)?>" placeholder="Buscar producto o categoría"><?php if(admin()):?><select name="usuario" aria-label="Persona" onchange="this.form.q.value='';this.form.submit()"><option value="">Todas las personas</option><?php foreach($team as $t):?><option value="<?=e($t['id'])?>"<?=owner()===(int)$t['id']?' selected':''?>><?=e(display_name($t).($t['area']?' · '.$t['area']:''))?></option><?php endforeach?></select><?php endif?><button>Buscar</button></form></div>
<div class="table"><table class="products"><thead><tr><th>Producto</th><th>Cantidad</th><th>Vencimiento</th><th>Cambio</th><th>Estado</th><?php if(admin()):?><th>Responsable</th><?php endif?><th>Acciones</th></tr></thead>
<?php if(!$groups):?><tbody><tr><td colspan="<?=$cols?>" class="empty"><?php if($q!==''||$filtered):?>No hay productos<?=$filtered?' de '.e($filtered):''?><?=$q!==''?' que coincidan con «'.e($q).'»':''?>. <a class="link" href="?page=productos">Quitar filtros</a><?php else:?>No hay productos registrados<?php endif?></td></tr></tbody><?php endif?>
<?php foreach($groups as $gid=>$dates):$first=$dates[0];?>
 <?php if(count($dates)===1):$d=(int)$first['dias'];?>
 <tbody><tr><td><strong><?=e($first['producto'])?></strong><small><?=e($meta($first))?></small></td><td><?=e($first['cantidad'])?></td><td><?=e($dmy($first['vencimiento']))?></td><td><?=$exchange($first)?></td><td><?=$badge($d)?></td><?=$owner($first)?><td><?=$edit($first)?> <?=$add($first)?><?=$delete($first)?></td></tr></tbody>
 <?php else:
  // Fila resumen: unidades totales, la fecha que vence primero y el estado de la fecha más urgente
  $total=array_sum(array_column($dates,'cantidad'));$soonest=min(array_map(fn($r)=>(int)$r['dias'],$dates));
  $notices=array_filter(array_column($dates,'fecha_cambio'));$withExchange=count(array_filter($dates,fn($r)=>$r['tiene_cambio']));$missing=count(array_filter($dates,fn($r)=>$r['tiene_cambio']&&!$r['fecha_cambio']));
  $open=$q!=='';?>
 <tbody class="group<?=$open?' open':''?>" id="grupo-<?=$gid?>">
  <tr class="group-head"><td><button type="button" class="group-toggle" aria-expanded="<?=$open?'true':'false'?>" aria-controls="grupo-<?=$gid?>"><span class="chev" aria-hidden="true"></span><span><strong><?=e($first['producto'])?></strong><small><?=e(implode(' · ',array_filter([(string)$first['codigo'],(string)$first['categoria']])))?></small></span><span class="dates-chip"><?=count($dates)?> fechas</span></button></td>
   <td><b><?=e($total)?></b><small>en total</small></td><td><?=e($dmy($first['vencimiento']))?><small>vence primero</small></td>
   <td><?php if(!$withExchange):?>No<?php elseif($missing):?>Sí<small class="missing">Falta el día en <?=$missing?> <?=$missing===1?'fecha':'fechas'?></small><?php else:?>Sí<small>Próximo aviso: <?=e($dmy(min($notices)))?></small><?php endif?></td>
   <td><?=$badge($soonest)?></td><?=$owner($first)?><td><?=$add($first)?></td></tr>
  <?php foreach($dates as $i=>$r):$d=(int)$r['dias'];?><tr class="group-row"><td><span class="date-mark">Fecha <?=$i+1?></span><?php if((string)$r['lote']!==''):?><small>Lote <?=e($r['lote'])?></small><?php endif?></td><td><?=e($r['cantidad'])?></td><td><?=e($dmy($r['vencimiento']))?></td><td><?=$exchange($r)?></td><td><?=$badge($d)?></td><?=admin()?'<td></td>':''?><td><?=$edit($r)?><?=$delete($r)?></td></tr><?php endforeach?>
 </tbody>
 <?php endif?>
<?php endforeach?>
</table></div></section>
