<?php
$users=$db->query('SELECT u.id,u.usuario,u.nombre,u.rol,u.area,u.activo,COUNT(p.id) productos,COALESCE(SUM(p.vencimiento<CURDATE()),0) vencidos,COALESCE(SUM(p.vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL '.DIAS_PROXIMO.' DAY)),0) por_vencer,COALESCE(SUM(p.cantidad),0) unidades FROM usuarios u LEFT JOIN productos p ON p.usuario_id=u.id GROUP BY u.id ORDER BY u.activo DESC,u.area IS NULL,u.area,COALESCE(u.nombre,u.usuario)')->fetch_all(MYSQLI_ASSOC);
$form=fn(string $action,int $id,string $inner,string $title)=>'<form autocomplete="off" method="post" data-title="'.e($title).'"><input type="hidden" name="csrf" value="'.e(csrf()).'"><input type="hidden" name="action" value="'.$action.'"><input type="hidden" name="id" value="'.$id.'">'.$inner.'</form>';
?>
<section class="panel"><h2>Nuevo usuario</h2><form method="post" class="grid-form user-form" autocomplete="off"><input type="hidden" name="csrf" value="<?=e(csrf())?>"><input type="hidden" name="action" value="user_save">
 <label>Nombre<input name="nombre" maxlength="100" autocomplete="off"></label>
 <label>Usuario de acceso<input name="usuario" minlength="3" autocomplete="off" required></label>
 <label>Contraseña<input type="password" name="clave" minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres" required></label>
 <label>Área<input name="area" autocomplete="off"></label>
 <label>Rol<select name="rol"><option value="empleado">Empleado</option><option value="admin">Administrador</option></select></label>
 <button>Crear usuario</button>
</form><p class="hint">Cada empleado solo verá y registrará sus propios productos. Tú, como administrador, ves los de todos.</p></section>

<section class="team-head"><div><h2>Equipo</h2><p><?=count($users)?> usuarios · por vencer en <?=DIAS_PROXIMO?> días o menos</p></div></section>
<div class="team">
<?php foreach($users as $u):$id=(int)$u['id'];$tn=$u['vencidos']?'crit':($u['por_vencer']?'warn':'ok');?>
 <article class="member t-<?=$tn?><?=$u['activo']?'':' off'?>">
  <div class="member-top"><span class="avatar"><?=e(mb_strtoupper(mb_substr(display_name($u),0,2)))?></span><div><b><?=e(display_name($u))?></b><small>@<?=e($u['usuario'])?> · <?=$u['rol']==='admin'?'Administrador':'Empleado'?><?=$u['activo']?'':' · Inactivo'?></small></div><span class="area-pill"><?=e($u['area']?:'Sin área')?></span></div>
  <div class="member-stats">
   <div><b><?=e($u['productos'])?></b><small>Productos</small></div>
   <div class="t-warn"><b><?=e($u['por_vencer'])?></b><small>Por vencer</small></div>
   <div class="t-crit"><b><?=e($u['vencidos'])?></b><small>Vencidos</small></div>
   <div><b><?=e(number_format((int)$u['unidades'],0,',','.'))?></b><small>Unidades</small></div>
  </div>
  <div class="member-actions">
   <a href="?page=dashboard&amp;usuario=<?=$id?>">Resumen</a><a href="?page=productos&amp;usuario=<?=$id?>">Productos</a><a href="?page=reportes&amp;usuario=<?=$id?>">Reporte</a>
   <details class="add-expiry"><summary>Editar</summary><?=$form('user_edit',$id,'<label>Nombre<input name="nombre" maxlength="100" autocomplete="off" value="'.e($u['nombre']).'"></label><label>Usuario de acceso<input name="usuario" minlength="3" maxlength="50" autocomplete="off" required value="'.e($u['usuario']).'"></label><label>Área<input name="area" autocomplete="off" value="'.e($u['area']).'"></label><label>Contraseña nueva<input type="password" name="clave" minlength="10" autocomplete="new-password"></label><p class="hint">Deja la contraseña vacía si no quieres cambiarla. Mínimo 10 caracteres.</p><button>Guardar</button>','Editar a '.display_name($u))?></details>
   <?php if($id!==(int)$_SESSION['uid']):?><form autocomplete="off" method="post" class="inline-delete"<?=$u['activo']?' onsubmit="return confirm(\'¿Desactivar este usuario? Ya no podrá ingresar.\')"':''?>><input type="hidden" name="csrf" value="<?=e(csrf())?>"><input type="hidden" name="action" value="user_toggle"><input type="hidden" name="id" value="<?=$id?>"><button class="<?=$u['activo']?'delete':''?>"><?=$u['activo']?'Desactivar':'Activar'?></button></form><?php endif?>
  </div>
 </article>
<?php endforeach?>
</div>
