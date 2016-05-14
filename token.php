<?php
$data = 'client_id=' . 'c6d0796ed6fce018dc01' . '&' .
		'client_secret=' . '5326984a606c6816f07c4c672a7d8b07f2a32a1f' . '&' .
		'code=' . urlencode($_GET['code']);
$ch = curl_init('https://github.com/login/oauth/access_token');
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
preg_match('/access_token=([0-9a-f]+)/', $response, $out);
echo $out[1];
curl_close($ch);
?>