<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS']),'samesite'=>'Lax']);
session_start();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$env=[];
if(is_file(__DIR__.'/.env')) foreach(file(__DIR__.'/.env', FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){
 $line=trim($line); if($line===''||$line[0]==='#'||!str_contains($line,'=')) continue;
 [$k,$v]=array_map('trim',explode('=',$line,2)); $env[$k]=trim($v,"\"'");
}
$cfg=fn(string $k,string $d='')=>$env[$k]??getenv($k)?:$d;
mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
try{
 $db=new mysqli($cfg('DB_HOST','127.0.0.1'),$cfg('DB_USER','root'),$cfg('DB_PASS'),$cfg('DB_NAME','control_vencimientos'),(int)$cfg('DB_PORT','3306'));
 $db->set_charset('utf8mb4');
}catch(Throwable $e){http_response_code(503);exit('No se pudo conectar con la base de datos. Revisa el archivo .env.');}
// Migraciones: se aplican solas la primera vez que se abre el sistema
$column=fn(string $table,string $name)=>(bool)$db->query("SHOW COLUMNS FROM $table LIKE '$name'")->num_rows;
if(!$column('usuarios','area'))$db->query('ALTER TABLE usuarios ADD area VARCHAR(80) NULL AFTER rol');
if(!$column('usuarios','nombre'))$db->query('ALTER TABLE usuarios ADD nombre VARCHAR(100) NULL AFTER usuario');
if(!$column('productos','usuario_id'))$db->query('ALTER TABLE productos ADD usuario_id INT UNSIGNED NULL AFTER producto_origen_id, ADD INDEX(usuario_id), ADD FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL');
if(!$column('productos','cambio_reportado'))$db->query('ALTER TABLE productos ADD cambio_reportado DATETIME NULL AFTER fecha_cambio');
// Los productos registrados antes de tener responsables quedan a nombre del primer administrador
$db->query("UPDATE productos SET usuario_id=(SELECT id FROM usuarios WHERE rol='admin' ORDER BY id LIMIT 1) WHERE usuario_id IS NULL");

const DIAS_PROXIMO=20;
const DIAS_CRITICO=3;

function e(mixed $v):string{return htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function go(string $p):never{header('Location: '.$p);exit;}
function auth():bool{return isset($_SESSION['uid']);}
function admin():bool{return ($_SESSION['rol']??'')==='admin';}
// Empleado: solo sus productos. Administrador: todos, o los de un usuario si lo eligió (?usuario=ID)
function owner():?int{if(!admin())return (int)($_SESSION['uid']??0);$id=(int)($_GET['usuario']??0);return $id>0?$id:null;}
function owner_sql():string{$id=owner();return $id===null?'1=1':'usuario_id='.$id;}
// Nombre visible: el que puso la persona o, si no tiene, su usuario de acceso
function display_name(?array $user=null):string{$user??=['nombre'=>$_SESSION['nombre']??'','usuario'=>$_SESSION['user']??''];return trim((string)($user['nombre']??''))?:(string)$user['usuario'];}
// Alertas: el día de pedir el cambio llegó (y aún no se reportó) o el producto ya venció
const ALERTA_CAMBIO='tiene_cambio=1 AND fecha_cambio<=CURDATE() AND vencimiento>=CURDATE() AND cambio_reportado IS NULL';
const ALERTA_VENCIDO='vencimiento<CURDATE()';
// El administrador puede modificar cualquier producto; el empleado solo los suyos
function can_edit(mysqli $db,int $id):bool{if(admin())return true;$uid=(int)$_SESSION['uid'];$s=$db->prepare('SELECT 1 FROM productos WHERE id=? AND usuario_id=?');$s->bind_param('ii',$id,$uid);$s->execute();return (bool)$s->get_result()->num_rows;}
function csrf():string{if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));return $_SESSION['csrf'];}
function check_csrf():void{if(!hash_equals($_SESSION['csrf']??'',(string)($_POST['csrf']??''))){http_response_code(419);exit('Formulario vencido. Vuelve a intentarlo.');}}
function flash(string $type,string $text):void{$_SESSION['flash']=[$type,$text];}
function audit(mysqli $db,string $action):void{$id=(int)($_SESSION['uid']??0);$user=(string)($_SESSION['user']??'sistema');$s=$db->prepare('INSERT INTO historial(usuario_id,usuario,accion) VALUES(NULLIF(?,0),?,?)');$s->bind_param('iss',$id,$user,$action);$s->execute();}
function valid_date(string $d):bool{return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/',$d,$m)&&checkdate((int)$m[2],(int)$m[3],(int)$m[1]);}
// Devuelve null si la fecha de cambio es válida (o no aplica), o el mensaje de error
function change_date_error(?string $change,string $date):?string{if($change===null||!valid_date($change))return 'Pon la fecha en que quieres que te avise para pedir el cambio.';if($change>$date)return 'La fecha para pedir el cambio no puede ser después del vencimiento.';return null;}
// [producto,categoria,proveedor,cantidad,tiene_cambio,fecha_cambio,vencimiento] o el mensaje de error
function product_fields():array|string{$name=trim((string)($_POST['producto']??''));$date=(string)($_POST['vencimiento']??'');if($name===''||!valid_date($date))return 'Completa nombre y una fecha válida.';$exchange=isset($_POST['tiene_cambio'])?1:0;$change=$exchange?(string)($_POST['fecha_cambio']??''):null;if($exchange&&($error=change_date_error($change,$date)))return $error;return [$name,trim((string)($_POST['categoria']??'')),trim((string)($_POST['proveedor']??'')),max(0,(int)($_POST['cantidad']??0)),$exchange,$change,$date];}
