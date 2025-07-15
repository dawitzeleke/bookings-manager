<?php

echo 'hwllow';
$first = 5;
$second = 7;


if (13 == '11'){
    echo 'hidden stuff';
}

$names = [
    'Alice',
    'Bob',
    'Charlie'
];

function sayHi($name = 'whooo'){
    echo "Hi, $name!\n";
}

function add($a, $b){
    return $a + $b;
}

foreach ($names as $name){
    sayHi($name);
}

sayHi();
echo add(3,3) . "\n";