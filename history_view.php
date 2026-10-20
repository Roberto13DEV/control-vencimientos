<?php
// Historial: solo los ingresos al sistema (quién entró, qué día y a qué hora)
$rows=$db->query("SELECT COALESCE(u.usuario,h.usuario) usuario,h.fecha,u.nombre,u.area FROM historial h LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.accion='Inicio de sesión' ORDER BY h.id DESC LIMIT 500")->fetch_all(MYSQLI_ASSOC);
$weekdays=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
$monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
$day=fn(string $at)=>$weekdays[(int)date('w',strtotime($at))].' '.(int)substr($at,8,2).' de '.$monthNames[(int)substr($at,5,2)-1].' de '.substr($at,0,4);
$hour=fn(string $at)=>date('g:i a',strtotime($at));
?>
<section class="panel"><h2>Ingresos al sistema</h2>
 <div class="table"><table><tr><th>Persona</th><th>Día</th><th>Hora</th></tr>
 <?php if(!$rows):?><tr><td colspan="3" class="empty">Todavía no hay ingresos registrados</td></tr><?php endif?>
 <?php foreach($rows as $r):?><tr><td><b><?=e(display_name($r))?></b><small><?=e(implode(' · ',array_filter(['@'.$r['usuario'],$r['area']])))?></small></td><td><?=e(ucfirst($day($r['fecha'])))?></td><td><?=e($hour($r['fecha']))?></td></tr><?php endforeach?>
 </table></div>
</section>
