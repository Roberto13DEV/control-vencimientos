<?php
$rows=$db->query('SELECT p.id,p.producto,p.categoria,p.proveedor,p.cantidad,p.vencimiento,p.fecha_cambio,DATEDIFF(p.vencimiento,CURDATE()) dias,DATEDIFF(CURDATE(),p.fecha_cambio) atraso,('.ALERTA_CAMBIO.') es_cambio,u.id uid,u.usuario,u.nombre,u.area FROM productos p LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE '.owner_sql().' AND (('.ALERTA_CAMBIO.') OR '.ALERTA_VENCIDO.') ORDER BY u.area IS NULL,u.area,u.usuario,p.vencimiento')->fetch_all(MYSQLI_ASSOC);
// Agrupadas por persona: el empleado solo tiene su grupo; el administrador ve uno por cada usuario con alertas
$groups=[];foreach($rows as $r)$groups[(int)$r['uid']][]=$r;
$months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
$short=fn(string $date)=>(int)substr($date,8,2).' '.$months[(int)substr($date,5,2)-1];
$days=fn(int $n)=>$n.' '.($n===1?'día':'días');
$hidden=fn(string $action,int $id)=>'<input type="hidden" name="csrf" value="'.e(csrf()).'"><input type="hidden" name="action" value="'.$action.'"><input type="hidden" name="id" value="'.$id.'"><input type="hidden" name="volver" value="alertas">';
?>
<?php if(!$rows):?><section class="panel calm"><span class="calm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></span><h3>Todo al día</h3><p>No hay cambios por reportar ni productos vencidos<?=admin()&&owner()===null?' en ningún usuario':''?>.</p></section><?php endif?>
<?php foreach($groups as $list):$person=$list[0];$changes=array_filter($list,fn($r)=>$r['es_cambio']);$expired=array_filter($list,fn($r)=>!$r['es_cambio']);?>
<section class="panel alert-group">
 <?php if(admin()):?><div class="alert-person"><span class="avatar"><?=e(mb_strtoupper(mb_substr(display_name($person),0,2)))?></span><div><b><?=e(display_name($person))?></b><small><?=e($person['area']?:'Sin área')?></small></div>
  <div class="alert-counts"><?php if($changes):?><span class="pill t-warn"><?=count($changes)?> por reportar</span><?php endif?><?php if($expired):?><span class="pill t-crit"><?=count($expired)?> <?=count($expired)===1?'vencido':'vencidos'?></span><?php endif?></div>
  <a class="link" href="?page=productos&amp;usuario=<?=e($person['uid'])?>">Ver sus productos →</a></div><?php endif?>
 <?php if($changes):?><h3 class="alert-title t-warn">Pedir cambio al proveedor</h3><ul class="alert-list">
  <?php foreach($changes as $r):$late=(int)$r['atraso'];?><li class="t-warn"><div class="prod"><b><?=e($r['producto'])?></b><small><?=e(implode(' · ',array_filter([$r['proveedor']?'Proveedor '.$r['proveedor']:'',$r['cantidad'].' unidades'])))?></small></div>
   <div class="when"><b><?=$late===0?'Avisar hoy':'Atrasado '.$days($late)?></b><small>Aviso programado: <?=e($short($r['fecha_cambio']))?></small><small>Vence el <?=e($short($r['vencimiento']))?> · en <?=e($days((int)$r['dias']))?></small></div>
   <form autocomplete="off" method="post"><?=$hidden('exchange_reported',(int)$r['id'])?><button class="done">Ya lo reporté</button></form></li><?php endforeach?>
 </ul><?php endif?>
 <?php if($expired):?><h3 class="alert-title t-crit">Productos vencidos</h3><ul class="alert-list">
  <?php foreach($expired as $r):?><li class="t-crit"><div class="prod"><b><?=e($r['producto'])?></b><small><?=e(implode(' · ',array_filter([$r['categoria'],$r['cantidad'].' unidades'])))?></small></div>
   <div class="when"><b>Venció hace <?=e($days(-(int)$r['dias']))?></b><small>el <?=e($short($r['vencimiento']))?></small></div>
   <?php if(admin()):?><form autocomplete="off" method="post" onsubmit="return confirm('¿Dar de baja este vencimiento?')"><?=$hidden('product_delete',(int)$r['id'])?><button class="delete">Dar de baja</button></form><?php else:?><small class="note">Retíralo de la venta; el administrador lo da de baja.</small><?php endif?></li><?php endforeach?>
 </ul><?php endif?>
</section>
<?php endforeach?>
