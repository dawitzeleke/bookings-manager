<?php

if ($_SERVER['REQUEST_METHOD'] === 'POST'){
echo '<pre>';
$name = filter_input(INPUT_POST, 'name');
var_dump($_POST['name']) ;
echo '</pre>';
}

?>

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
<style>
  .flex {
    display: flex;
  }
.flex-col{
    flex-direction: column;
}
.gap-3{
    gap: 1rem;
}
</style>
  </head>
  <body>
<form action="" method="POST" class="flex flex-col gap-3">
  <label>
    <span>name</span>
    <input name="name" value="abebe" type="text">
  </label>

  <label>
    <span>email</span>
    <input name="email" type="email" value="abebe@gmail.com">
  </label>

  <button>submit</button>
</form>
<?php
  echo "Hello world <br>";
  echo 'hello2 world<br>';
  echo 'hello2-' . '-world';

?>
  </body>
</html>
