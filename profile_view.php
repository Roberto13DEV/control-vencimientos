<?php
$uid=(int)$_SESSION['uid'];$s=$db->prepare('SELECT usuario,nombre,rol,area,creado FROM usuarios WHERE id=?');$s->bind_param('i',$uid);$s->execute();$u=$s->get_result()->fetch_assoc();
$stats=$db->query('SELECT COUNT(*),COALESCE(SUM(cantidad),0) FROM productos WHERE usuario_id='.$uid)->fetch_row();
?>
<section class="panel profile">
 <div class="profile-top"><span class="avatar"><?=e(mb_strtoupper(mb_substr(display_name($u),0,2)))?></span><div><h2><?=e(display_name($u))?></h2><p>Usuario de acceso: <b><?=e($u['usuario'])?></b> · <?=$u['rol']==='admin'?'Administrador':'Empleado'?> · <?=e($u['area']?:'Sin área')?></p><p><?=e($stats[0])?> productos registrados · <?=e(number_format((int)$stats[1],0,',','.'))?> unidades</p></div></div>
 <form autocomplete="off" method="post" class="grid-form profile-form"><input type="hidden" name="csrf" value="<?=e(csrf())?>"><input type="hidden" name="action" value="profile_save">
  <label class="wide">Tu nombre<input name="nombre" value="<?=e($u['nombre'])?>" maxlength="100" autocomplete="off"></label>
  <button>Guardar nombre</button>
 </form>
 <p class="hint">Tu nombre se muestra en el menú, en las alertas y en los reportes para que se sepa quién registró cada producto. <?=admin()?'Tu contraseña y tu área se cambian desde Usuarios.':'Para cambiar tu contraseña o tu área, pídeselo al administrador.'?></p>
</section>
