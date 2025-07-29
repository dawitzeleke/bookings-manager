import fs from "fs";
import ScyllaDb from "./ScyllaDb.js";

function buildCreateParams(tableName, cfg) {
  // 1) table & primary key
  const KeySchema = cfg.KeySchema;
  // 2) gather all attribute names that appear in any key schema
  const keyAttrs = new Set(KeySchema.map((ks) => ks.AttributeName));

  // 3) if you have global (or local) secondary indexes, collect their key attributes too
  const GlobalSecondaryIndexes = cfg.GlobalSecondaryIndexes || [];
  GlobalSecondaryIndexes.forEach((gsi) =>
    gsi.KeySchema.forEach((ks) => keyAttrs.add(ks.AttributeName))
  );

  // 4) filter your config's AttributeDefinitions to only those key attributes
  const AttributeDefinitions = cfg.AttributeDefinitions.filter((ad) =>
    keyAttrs.has(ad.AttributeName)
  );

  // 5) assemble CreateTableInput
  const params = {
    TableName: tableName,
    KeySchema,
    AttributeDefinitions,
    ProvisionedThroughput: cfg.ProvisionedThroughput,
  };

  if (GlobalSecondaryIndexes.length) {
    params.GlobalSecondaryIndexes = GlobalSecondaryIndexes;
  }

  return params;
}

async function main() {
  const tableConfigs = JSON.parse(
    fs.readFileSync("./config/tables.json", "utf8")
  );
  console.log("✅ Table configurations loaded:", Object.keys(tableConfigs));

  // // Configure ScyllaDB client with cache enabled
  // ScyllaDb.configure({
  //   endpoint: process.env.SCYLLA_ENDPOINT || "http://localhost:8000/",
  //   port: process.env.SCYLLA_PORT || 8000,
  //   region: process.env.SCYLLA_REGION || "us-east-1",
  //   key: process.env.SCYLLA_KEY || "test",
  //   secret: process.env.SCYLLA_SECRET || "test",
  //   enableCache: true, // Enable cache
  // });

  ScyllaDb.configure({
    endpoint:
      "https://i7wrvsvkgmteuu4co2sd3r5tle0cxpwf.lambda-url.ap-northeast-1.on.aws/scylla",
    region: "ap-northeast-1",
    port: 443,
    key: "test",
    secret: "test",
    enableCache: false,
  });
  ScyllaDb.beginSession();

  console.log("✅ ScyllaDB client configured with cache enabled");

  // Load table configs into ScyllaDb
  await ScyllaDb.loadTableConfigs("./config/tables.json");
  console.log("✅ Table configs loaded into ScyllaDb");
  console.log("list of tables:", await ScyllaDb.listTables());

  const schemaTablesNames = await ScyllaDb.listTables();
  for (const tableName of Object.keys(tableConfigs)) {
    console.log(`Table: ${tableName}`);
    if (!schemaTablesNames.find((name) => tableName === name)) {
      console.log(`Table ${tableName} does not exist in ScyllaDB, creating...`);
      const schema = ScyllaDb.getSchemaFromConfig(tableName);
      schema.TableName = tableName;

      await ScyllaDb.createTable(schema);
    } else {
      console.log(
        "got table, decription:",
        await ScyllaDb.describeTable(tableName)
      );
    }
  }
  console.log(
    "create",
    await ScyllaDb.putItem("pupils", {
      id: "1234567",
      email: "user@example.com",
      name: "John Doe",
      age: 30,
      created_at: "2025-01-01T12:00:00Z",
      nickName: "jeny",
    })
  );

  //read
  console.log(
    "getting item",
    await ScyllaDb.getItem("pupils", { id: "1234567", name: "John Doe" })
  );

  console.log(
    "updating item",
    await ScyllaDb.updateItem(
      "pupils",
      { id: "1234567", name: "John Doe" },
      { nickName: "j3ny" }
    )
  );

  // console.log(
  //   "updating item",
  //   await ScyllaDb.updateItem(
  //     "users",
  //     { id: "user123" },
  //     { name: "jane dow", age: 31 }
  //   )
  // );
  // return;

  console.log(
    "deleting item",
    await ScyllaDb.deleteItem("pupils", { id: "1234567", name: "John Doe" })
  );

  console.log(
    "getting item after deletion",
    await ScyllaDb.getItem("pupils", { id: "1234567", name: "John Doe" })
  );
  return;
}
main();
