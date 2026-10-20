<?php
$now=$db->query("SELECT CURDATE() hoy,DATE_FORMAT(NOW(),'%d/%m/%Y %H:%i') ahora")->fetch_assoc();$hoy=$now['hoy'];
$monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
$types=['todos'=>'Todos los del mes','por_vencer'=>'Por vencer','vencidos'=>'Vencidos'];
$mes=(string)($_GET['mes']??'');if(!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/',$mes))$mes=substr($hoy,0,7);
$tipo=(string)($_GET['tipo']??'');if(!isset($types[$tipo]))$tipo='todos';
$from="$mes-01";$to=date('Y-m-t',strtotime($from));
// El estado (vencido / por vencer) se calcula respecto a hoy, no al mes elegido
$where='vencimiento BETWEEN ? AND ?'.($tipo==='por_vencer'?' AND vencimiento>=CURDATE()':($tipo==='vencidos'?' AND vencimiento<CURDATE()':''));
// Responsable: el empleado siempre él mismo; el administrador puede elegir uno o ver todos
$owner=owner();$person=null;if($owner!==null){$s=$db->prepare('SELECT usuario,nombre,area FROM usuarios WHERE id=?');$s->bind_param('i',$owner);$s->execute();$person=$s->get_result()->fetch_assoc();}
$personName=$person?display_name($person).($person['area']?' · '.$person['area']:''):null;
$team=admin()?$db->query('SELECT id,usuario,nombre,area FROM usuarios ORDER BY COALESCE(nombre,usuario)')->fetch_all(MYSQLI_ASSOC):[];
$showOwner=admin()&&$owner===null;
$s=$db->prepare("SELECT p.producto,p.categoria,p.proveedor,p.lote,p.cantidad,p.tiene_cambio,p.fecha_cambio,p.vencimiento,DATEDIFF(p.vencimiento,CURDATE()) dias,COALESCE(NULLIF(TRIM(u.nombre),''),u.usuario) responsable FROM productos p LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE $where AND ".owner_sql()." ORDER BY p.vencimiento,p.producto");
$s->bind_param('ss',$from,$to);$s->execute();$rows=array_map(fn($r)=>['dias'=>(int)$r['dias'],'cantidad'=>(int)$r['cantidad']]+$r,$s->get_result()->fetch_all(MYSQLI_ASSOC));
$expired=array_filter($rows,fn($r)=>$r['dias']<0);
$units=fn(array $list):int=>array_sum(array_column($list,'cantidad'));
$hasLot=(bool)array_filter(array_column($rows,'lote'));
$tone=fn(int $d)=>$d<=DIAS_CRITICO?'crit':($d<=DIAS_PROXIMO?'warn':'ok');
$label=fn(int $d)=>$d<0?'Vencido':($d<=DIAS_CRITICO?'Crítico':($d<=DIAS_PROXIMO?'Próximo':'Vigente'));
$dmy=fn(?string $date)=>$date?substr($date,8,2).'/'.substr($date,5,2).'/'.substr($date,0,4):'—';
$monthName=$monthNames[(int)substr($mes,5,2)-1].' '.substr($mes,0,4);
$title='Reporte de vencimientos · '.ucfirst($monthName);
$subtitle=$types[$tipo].' · del 1 al '.(int)substr($to,8,2).' de '.$monthName;
// De quién es el reporte: la persona elegida (o uno mismo, si es empleado) o todas
$colaborador='Colaborador: '.($personName??'todas las personas');
$slug=fn(string $text)=>trim(preg_replace('/[^a-z0-9]+/','-',strtolower(strtr($text,['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','Ü'=>'u','Ñ'=>'n']))),'-');
$fileName='reporte-vencimientos-'.$mes.($tipo==='todos'?'':'-'.str_replace('_','-',$tipo)).($person&&admin()?'-'.$slug(display_name($person)):'').'.pdf';
