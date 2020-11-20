<?php
/**
 * Created by Francis Pires.
 * Date: 01/07/2016
 */
/** Error reporting */
error_reporting(E_ALL);
ini_set('display_errors', TRUE);
ini_set('display_startup_errors', TRUE);
require_once('../../config.php');

//  TODO: Usar biblioteca compatível com o ambiente.
//  require_once($CFG->dirroot . '/mod/scorm/locallib.php');
//  require_once($CFG->dirroot . '/lib/phpexcel/Phpexcel/IOFactory.php');
//  date_default_timezone_set('America/Sao_Paulo');

header('Cache-Control: no-cache');
header('Content-type: application/json; charset="utf-8"', true);
header('Access-Control-Allow-Origin: *');// Colocar o domínio aqui.
$action = $_REQUEST['a'];
function saveData($key,$value,$user){
    $table = 'mdl_scorm_itau_unicef';
    //Salva ou atualiza as informações passadas.
    global $DB;

    if($key[0]=='a'){
        if($key[1]=='2'){
            $key[1]='3';
        }
        elseif ($key[1]=='3'){
            $key[1]='2';
        }
    }

    $result = $DB->get_record_sql("SELECT id,v FROM $table WHERE u = '$user' AND k = '$key'");
    if (empty($result)) {
        $sql = "INSERT INTO $table (k,u,v) VALUES('$key','$user','$value')";
        $DB->execute($sql);
        echo(json_encode('inserted'));
    }
    else{
        $id = $result->id;
        $sql = "UPDATE $table SET v = '$value' where id = '$id'";
        $DB->execute($sql);
    }
}
function getUser(){
    global $USER;
    echo(json_encode($USER));
}
function readData($user){
    $table = 'mdl_scorm_itau_unicef';
    global $DB;
    $result = $DB->get_records_sql("SELECT * FROM $table WHERE u = '$user'");
    echo(json_encode($result));
}
if($action=='getUser'){
    getUser();
}
if ($action=="save"){
    $key = $_REQUEST['k'];
    $value = $_REQUEST['v'];
    $user = $_REQUEST['u'];
    saveData($key,$value,$user);
}
if ($action=="read"){
    $user = $_REQUEST['u'];
    readData($user);
}
if ($action=="getData"){
    $user = $_REQUEST['user'];
    $table = 'mdl_scorm_itau_unicef';
    $sql = "SELECT k,v
              FROM $table
             WHERE k NOT LIKE '%pag%' 
              AND u = '$user'";
    $r = $DB->get_records_sql($sql);
    //var_dump($r);
    echo json_encode($r);
}
if ($action=="getExcel"){
    $table = 'mdl_scorm_itau_unicef';
    global $DB;
    $user = 'admin';
    $result = $DB->get_records_sql("SELECT k,v,u 
                                      FROM $table 
                                     WHERE u = '$user' 
                                       AND k NOT LIKE '%pag%'");
    getExcel(array_map("formatAnswer", $result));
}
if($action=='getVisitedPages'){
    $user = $_REQUEST['user'];
    $table = 'mdl_scorm_itau_unicef';
    $sql = "SELECT v
              FROM $table
             WHERE k = 'pagination' 
              AND u = '$user'";
    $r = $DB->get_record_sql($sql);
    //var_dump($r);
    echo json_encode($r->v);
}

function formatAnswer($a){
    return array(
        'user'      => $a->u,
        'question'	=> $a->k,
        'answer'	=> $a->v
    );
}

function getExcel($data){
    $objReader = PHPExcel_IOFactory::createReader('Excel2007');
    $objPHPExcel = $objReader->load("excel/templates/itauunicef2007.xlsx");
    $objPHPExcel->setActiveSheetIndex(0);
    $objPHPExcel->getActiveSheet()->setCellValue('B3', PHPExcel_Shared_Date::PHPToExcel(time()));

    $styleArrayHeaderTab = array (
        'font' => array (
            'bold' => true,
            'color' => array (
                'rgb' => 'FFFFFF'
            ),
            'size' => 11,
            'name' => 'Arial'
        ),
        'fill' => array (
            'type' => PHPExcel_Style_Fill::FILL_SOLID,
            'color' => array (
                'rgb' => 'FF0000'
            )
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_RIGHT
        )
    );
    $styleArrayHeader = array (
        'font' => array (
            'bold' => true,
            'color' => array (
                'rgb' => 'FF0000'
            ),
            'size' => 11,
            'name' => 'Arial'
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_GENERAL
        )
    );
    $styleArrayTextDate = array (
        'font' => array (
            'bold' => false,
            'color' => array (
                'rgb' => '000000'
            ),
            'size' => 11,
            'name' => 'Arial'
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_RIGHT
        )
    );
    $styleArrayTextName = array (
        'font' => array (
            'bold' => false,
            'color' => array (
                'rgb' => '000000'
            ),
            'size' => 11,
            'name' => 'Arial'
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_RIGHT
        )
    );
    $styleArrayBodyValue = array (
        'font' => array (
            'bold' => false,
            'color' => array (
                'rgb' => '000000'
            ),
            'size' => 10,
            'name' => 'Arial'
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_RIGHT
        )
    );
    $styleArrayBodyText = array (
        'font' => array (
            'bold' => false,
            'color' => array (
                'rgb' => '0070C0'
            ),
            'size' => 10,
            'name' => 'Arial'
        ),
        'alignment' => array (
            'horizontal' => PHPExcel_Style_Alignment::HORIZONTAL_RIGHT
        )
    );
    $sharedStyle = new PHPExcel_Style();
    $sharedStyleAlternate = new PHPExcel_Style();
    $sharedStyle->applyFromArray(
        array(
            'borders' => array(
                'bottom' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'top' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'left' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'right' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
            ),
            'fill'  => array(
                'type' => PHPExcel_Style_Fill::FILL_SOLID,
                'color' => array('argb' => 'DDDDDDDD')
            )
        )
    );
    $sharedStyleAlternate->applyFromArray(
        array(
            'borders' => array(
                'bottom' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'top' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'left' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
                'right' => array('style' => PHPExcel_Style_Border::BORDER_THIN),
            ),
            'fill'  => array(
                'type' => PHPExcel_Style_Fill::FILL_SOLID,
                'color' => array('argb' => 'F2F2F2F2')
            )
        )
    );
    $baseRow = 8;
    $ct=0;
    foreach($data as $r => $dataRow) {
        $ct++;
        $row = $baseRow + $r;
        $objPHPExcel->getActiveSheet()->insertNewRowBefore($row,1);
        $objPHPExcel->getActiveSheet()
            //->setCellValue('A'.$row, $r+1)
            ->setCellValue('A'.$row, $dataRow['user'])
            ->setCellValue('B'.$row, $dataRow['question'])
            ->setCellValue('C'.$row, $dataRow['answer'])
            //->setCellValue('E'.$row, '=C'.$row.'*D'.$row)
        ;
        $objPHPExcel->getActiveSheet()
            ->setSharedStyle($ct%2==0?$sharedStyleAlternate:$sharedStyle, 'A'.$row . ':D'.$row);
        $objPHPExcel->getActiveSheet ()
            ->getStyle('A'.$row . ':D'.$row)->applyFromArray ($styleArrayBodyValue);
    }
    $objPHPExcel->getActiveSheet()->removeRow($baseRow-1,1);
    //auto size
    $objPHPExcel->getActiveSheet ()->getColumnDimension ( "A" )->setAutoSize ( true );
    $objPHPExcel->getActiveSheet ()->getColumnDimension ( "B" )->setAutoSize ( true );
    $objPHPExcel->getActiveSheet ()->getColumnDimension ( "C" )->setAutoSize ( true );

    $objPHPExcel->getProperties()->setCreator("Itaú/Unicef")
        ->setLastModifiedBy("Itaú/Unicef")
        ->setTitle("Relatório de Respostas Unicef/Itaú")
        ->setSubject("Relatório de Respostas Unicef/Itaú")
        ->setDescription("Relatório de Respostas Unicef/Itaú")
        ->setKeywords("office 2007 openxml php")
        ->setCategory("Report");

    header("Content-Type: application/vnd.ms-excel");
    header("Content-Disposition: attachment; filename=\"itauunicef.xlsx\"");
    header("Cache-Control: max-age=0");
    $objWriter = PHPExcel_IOFactory::createWriter($objPHPExcel, 'Excel2007');
    $objWriter->save(str_replace('.php', '.xlsx', __FILE__));
    readfile(str_replace('.php', '.xlsx', __FILE__));
}