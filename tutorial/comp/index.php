<?php
require 'vendor/autoload.php';
use GuzzleHttp\Client;

$client = new Client();
$response = $client->request('GET', 'https://example.com');
$body = $response->getBody();

echo 'response is' . $body;

?>


<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>