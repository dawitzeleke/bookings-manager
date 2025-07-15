<?php

use Yz\Comp\MyApp;




require 'vendor/autoload.php';
// use GuzzleHttp\Client;

// $client = new Client();
// $response = $client->request('GET', 'https://example.com');
// $body = $response->getBody();

// echo 'response is' . $body;
// 


$app = new MyApp();
$app->sayHi();
