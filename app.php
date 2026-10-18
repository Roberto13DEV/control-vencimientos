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

const DIAS_PROXIMO=20;

function e(mixed $v):string{return htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function go(string $p):never{header('Location: '.$p);exit;}
function auth():bool{return isset($_SESSION['uid']);}
function admin():bool{return ($_SESSION['rol']??'')==='admin';}
function csrf():string{if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));return $_SESSION['csrf'];}
function check_csrf():void{if(!hash_equals($_SESSION['csrf']??'',(string)($_POST['csrf']??''))){http_response_code(419);exit('Formulario vencido. Vuelve a intentarlo.');}}
function flash(string $type,string $text):void{$_SESSION['flash']=[$type,$text];}
function audit(mysqli $db,string $action):void{$id=(int)($_SESSION['uid']??0);$user=(string)($_SESSION['user']??'sistema');$s=$db->prepare('INSERT INTO historial(usuario_id,usuario,accion) VALUES(NULLIF(?,0),?,?)');$s->bind_param('iss',$id,$user,$action);$s->execute();}
function valid_date(string $d):bool{return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/',$d,$m)&&checkdate((int)$m[2],(int)$m[3],(int)$m[1]);}
// [codigo,producto,categoria,proveedor,lote,cantidad,tiene_cambio,aviso_dias,vencimiento] o null si falta nombre o fecha
function product_fields():?array{$name=trim((string)($_POST['producto']??''));$date=(string)($_POST['vencimiento']??'');if($name===''||!valid_date($date))return null;return [trim((string)($_POST['codigo']??'')),$name,trim((string)($_POST['categoria']??'')),trim((string)($_POST['proveedor']??'')),trim((string)($_POST['lote']??'')),max(0,(int)($_POST['cantidad']??0)),isset($_POST['tiene_cambio'])?1:0,max(1,min(365,(int)($_POST['aviso_dias']??3))),$date];}
