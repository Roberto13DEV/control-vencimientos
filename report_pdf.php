<?php
// Descarga directa del reporte en PDF (A4) con FPDF; usa los mismos datos que la página de Reportes
require __DIR__.'/report_data.php';
require __DIR__.'/lib/fpdf/fpdf.php';
// FPDF trabaja con fuentes en Windows-1252: convertimos los textos (tildes, ñ, ·, —)
$t=fn($s)=>mb_convert_encoding((string)$s,'Windows-1252','UTF-8');
$colors=['ink'=>[17,18,20],'muted'=>[122,127,135],'line'=>[236,238,240],'sunken'=>[245,246,247],'crit'=>[255,90,31],'warn'=>[242,161,58],'ok'=>[125,177,15]];

$pdf=new class('P','mm','A4') extends FPDF{
 public string $foot='';
 function Footer(){$this->SetY(-13);$this->SetFont('Helvetica','',8);$this->SetTextColor(122,127,135);$this->Cell(0,5,$this->foot,0,0,'L');$this->SetX(15);$this->Cell(0,5,mb_convert_encoding('Página ','Windows-1252','UTF-8').$this->PageNo().' de {nb}',0,0,'R');}
};
$pdf->foot=$t('Control de Vencimientos · VENCE+ — Datos al '.$dmy($hoy));
$pdf->SetTitle($t($title),false);$pdf->SetAuthor($t(display_name()),false);
$pdf->SetMargins(15,15,15);$pdf->SetAutoPageBreak(false);$pdf->AliasNbPages();$pdf->AddPage();
$color=fn(string $what,array $rgb)=>$pdf->{'Set'.$what.'Color'}(...$rgb);

// Encabezado
$pdf->SetFont('Helvetica','B',15);$color('Text',$colors['ink']);$pdf->Cell($pdf->GetStringWidth('VENCE'),7,'VENCE');$color('Text',$colors['crit']);$pdf->Cell(5,7,'+');
$pdf->SetFont('Helvetica','',9);$color('Text',$colors['muted']);$pdf->SetXY(15,16);$pdf->Cell(180,5,$t('Generado el '.$now['ahora']),0,2,'R');$pdf->Cell(180,5,$t('Por '.display_name()),0,0,'R');
$pdf->SetXY(15,27);$pdf->SetFont('Helvetica','B',17);$color('Text',$colors['ink']);$pdf->Cell(180,8,$t($title),0,2);
$pdf->SetFont('Helvetica','',9.5);$color('Text',$colors['muted']);$pdf->SetFont('Helvetica','B',10);$color('Text',$colors['ink']);$pdf->Cell(180,5,$t($colaborador),0,2);$pdf->SetFont('Helvetica','',9.5);$color('Text',$colors['muted']);$pdf->Cell(180,5,$t($subtitle),0,2);
$pdf->SetLineWidth(.6);$color('Draw',$colors['ink']);$pdf->Line(15,49,195,49);

// Totales
$kpis=[['Productos',(string)count($rows),'',null],['Unidades',number_format($units($rows),0,',','.'),'',null],['Vencidos',(string)count($expired),number_format($units($expired),0,',','.').' unidades','crit'],['Por vencer',(string)(count($rows)-count($expired)),number_format($units($rows)-$units($expired),0,',','.').' unidades','warn']];
foreach($kpis as $i=>[$name,$value,$note,$tn]){
 $x=15+$i*46;$y=55;$color('Fill',$colors['sunken']);$pdf->Rect($x,$y,42,20,'F');
 if($tn){$color('Fill',$colors[$tn]);$pdf->Rect($x,$y,1.2,20,'F');}
 $pdf->SetXY($x+4,$y+2.5);$pdf->SetFont('Helvetica','',8);$color('Text',$colors['muted']);$pdf->Cell(36,4,$t($name),0,2);
 $pdf->SetFont('Helvetica','B',15);$color('Text',$colors['ink']);$pdf->Cell(36,7,$t($value),0,2);
 if($note!==''){$pdf->SetFont('Helvetica','',7.5);$color('Text',$colors['muted']);$pdf->Cell(36,4,$t($note),0,2);}
}

// Tabla
$cols=['producto'=>['Producto',$hasLot?89:105,'L'],'proveedor'=>['Proveedor',26,'L']]+($hasLot?['lote'=>['Lote',16,'L']]:[])+['cantidad'=>['Cant.',12,'R'],'vence'=>['Vence',20,'L'],'dias'=>['Días',17,'L']];
// Recorta un texto para que quepa en el ancho de su columna
$fit=function(string $text,float $width)use($pdf,$t){$s=$t($text);if($pdf->GetStringWidth($s)<=$width)return $s;while($s!==''&&$pdf->GetStringWidth($s.'...')>$width)$s=substr($s,0,-1);return $s.'...';};
$tableHead=function()use($pdf,$cols,$t,$color,$colors){$pdf->SetFont('Helvetica','B',8);$color('Text',$colors['muted']);$pdf->SetX(15);foreach($cols as [$name,$w,$align]){$x=$pdf->GetX();$pdf->Cell($align==='R'?$w-3:$w,7,$t($name),0,0,$align);$pdf->SetX($x+$w);}$pdf->Ln();$pdf->SetLineWidth(.2);$color('Draw',$colors['line']);$pdf->Line(15,$pdf->GetY(),195,$pdf->GetY());};
$pdf->SetY(83);
if(!$rows){$pdf->SetY(95);$pdf->SetFont('Helvetica','',11);$color('Text',$colors['muted']);$pdf->Cell(180,10,$t('No hay productos '.($tipo==='vencidos'?'vencidos':($tipo==='por_vencer'?'por vencer':'que venzan')).' en '.$monthName.'.'),0,1,'C');}
else{
 $tableHead();
 foreach($rows as $r){
  $d=$r['dias'];$h=11;
  if($pdf->GetY()+$h>297-20){$pdf->AddPage();$tableHead();}
  $y=$pdf->GetY();$x=15;
  $cells=['proveedor'=>$r['proveedor']?:'—','lote'=>$r['lote']?:'—','cantidad'=>(string)$r['cantidad'],'vence'=>$dmy($r['vencimiento']),'dias'=>$d<0?'hace '.-$d.' d':($d===0?'Hoy':$d.' d')];
  foreach($cols as $key=>[$name,$w,$align]){
   if($key==='producto'){
    $pdf->SetXY($x+1,$y+1.5);$pdf->SetFont('Helvetica','B',9);$color('Text',$colors['ink']);$pdf->Cell($w-2,4,$fit($r['producto'],$w-3));
    $line=implode(' · ',array_filter([$r['categoria'],$showOwner?($r['responsable']?:'Sin responsable'):'']));if($line!==''){$pdf->SetXY($x+1,$y+5.6);$pdf->SetFont('Helvetica','',7.5);$color('Text',$colors['muted']);$pdf->Cell($w-2,4,$fit($line,$w-3));}
   }else{
    $pdf->SetXY($x,$y+3);$pdf->SetFont('Helvetica','',9);$color('Text',$colors['ink']);$pdf->Cell($w-($align==='R'?3:1),5,$fit($cells[$key],$w-2),0,0,$align);
   }
   $x+=$w;
  }
  $pdf->SetY($y+$h);$color('Draw',$colors['line']);$pdf->Line(15,$y+$h,195,$y+$h);
 }
}
$pdf->Output('D',$fileName);
