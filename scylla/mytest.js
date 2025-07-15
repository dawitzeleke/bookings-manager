import fs from "fs";
import ScyllaDb from "./ScyllaDb.js";

async function main() {
  const tableConfigs = JSON.parse(
    fs.readFileSync("./config/tables.json", "utf8")
  );
  console.log("✅ Table configurations loaded:", Object.keys(tableConfigs));

  // Configure ScyllaDB client with cache enabled
  ScyllaDb.configure({
    endpoint: process.env.SCYLLA_ENDPOINT || "http://localhost:8000/",
    port: process.env.SCYLLA_PORT || 8000,
    region: process.env.SCYLLA_REGION || "us-east-1",
    key: process.env.SCYLLA_KEY || "test",
    secret: process.env.SCYLLA_SECRET || "test",
    enableCache: true, // Enable cache
  });

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
      console.log("🚀 ~ main ~ schema:", schema);

      await ScyllaDb.createTable(schema);
    } else {
      console.log(
        "got table, decription:",
        await ScyllaDb.describeTable(tableName)
      );
    }
  }

  //create
  await ScyllaDb.putItem("pupils", {
    id: "123",
    name: "John Doe",
    nickName: "jonny",
  });

  //read
  console.log(
    "getting item",
    await ScyllaDb.getItem("pupils", { id: "123", name: "John Doe" })
  );

  console.log(
    "updating item",
    await ScyllaDb.updateItem(
      "pupils",
      { id: "123", name: "John Doe" },
      { nickName: "j3ny" }
    )
  );

  console.log(
    "deleting item",
    await ScyllaDb.deleteItem("pupils", { id: "123", name: "John Doe" })
  );

  console.log(
    "getting item after deletion",
    await ScyllaDb.getItem("pupils", { id: "123", name: "John Doe" })
  );
}
main();
