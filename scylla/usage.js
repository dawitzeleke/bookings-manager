import fs from "fs";
import ScyllaDb from "./ScyllaDb.js";

// ============================================================
// TRANSACTION TESTS
// ============================================================

async function testTransactWriteWithConditions() {
  console.log("\n🧪 Testing transactWrite with conditions...");

  try {
    // Test 1: Transaction with condition expressions
    console.log("\n1️⃣ Transaction with condition expressions:");

    const transactItems = [
      {
        Put: {
          TableName: "products",
          Item: {
            id: { S: "transact003" },
            category: { S: "electronics" },
            name: { S: "Conditional Product" },
            price: { N: "399.99" },
            stock: { N: "5" },
            createdAt: { N: Date.now().toString() },
          },
          ConditionExpression: "attribute_not_exists(id)",
        },
      },
      {
        Update: {
          TableName: "products",
          Key: {
            id: { S: "transact001" },
            category: { S: "electronics" },
          },
          UpdateExpression: "SET stock = stock + :inc",
          ExpressionAttributeValues: {
            ":inc": { N: "5" },
          },
          ConditionExpression: "stock >= :minStock",
          ExpressionAttributeValues: {
            ":inc": { N: "5" },
            ":minStock": { N: "0" },
          },
        },
      },
    ];

    console.log("Sending conditional TransactWriteItems request...");
    const result = await ScyllaDb.rawRequest("TransactWriteItems", {
      TransactItems: transactItems,
    });

    console.log("✅ Conditional TransactWrite successful:", result);
  } catch (error) {
    console.error("❌ Conditional TransactWrite failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

// ============================================================
// SIMPLE TRANSACTION ALTERNATIVE TESTS
// ============================================================

async function testSimpleTransactionAlternative() {
  console.log("\n🧪 Testing simple transaction alternative...");

  try {
    // Test 1: Multiple operations using existing methods
    console.log("\n1️⃣ Multiple operations using existing methods:");

    // Create test items using putItem
    const item1 = {
      id: "simple001",
      category: "electronics",
      name: "Simple Transaction Test 1",
      price: 199.99,
      stock: 10,
      createdAt: Date.now(),
    };

    const item2 = {
      id: "simple002",
      category: "books",
      name: "Simple Transaction Test 2",
      price: 15.99,
      stock: 25,
      createdAt: Date.now(),
    };

    console.log("Putting item 1...");
    await ScyllaDb.putItem("products", item1);
    console.log("✅ Item 1 created");

    console.log("Putting item 2...");
    await ScyllaDb.putItem("products", item2);
    console.log("✅ Item 2 created");

    // Verify both items
    const retrieved1 = await ScyllaDb.getItem("products", {
      id: "simple001",
      category: "electronics",
    });
    const retrieved2 = await ScyllaDb.getItem("products", {
      id: "simple002",
      category: "books",
    });

    console.log("✅ Verified item 1:", retrieved1?.name);
    console.log("✅ Verified item 2:", retrieved2?.name);

    // Test 2: Update operations
    console.log("\n2️⃣ Update operations:");

    console.log("Updating item 1...");
    const updated1 = await ScyllaDb.updateItem(
      "products",
      { id: "simple001", category: "electronics" },
      {
        price: 179.99,
        updatedAt: Date.now(),
      }
    );
    console.log("✅ Item 1 updated:", updated1?.price);

    console.log("Updating item 2...");
    const updated2 = await ScyllaDb.updateItem(
      "products",
      { id: "simple002", category: "books" },
      {
        stock: 30,
        updatedAt: Date.now(),
      }
    );
    console.log("✅ Item 2 updated:", updated2?.stock);

    console.log("✅ Simple transaction alternative completed successfully");
  } catch (error) {
    console.error("❌ Simple transaction alternative failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

// ============================================================
// BATCH OPERATION TESTS (REAL TRANSACTION ALTERNATIVES)
// ============================================================

async function testBatchWriteItem() {
  console.log("\n🧪 Testing batchWriteItem (transaction alternative)...");

  try {
    // Test 1: Batch write with multiple items
    console.log("\n1️⃣ Batch write with multiple items:");

    const items = [
      {
        id: "batch001",
        category: "electronics",
        name: "Batch Product 1",
        price: 199.99,
        stock: 15,
        createdAt: Date.now(),
      },
      {
        id: "batch002",
        category: "books",
        name: "Batch Product 2",
        price: 29.99,
        stock: 25,
        createdAt: Date.now(),
      },
      {
        id: "batch003",
        category: "clothing",
        name: "Batch Product 3",
        price: 79.99,
        stock: 30,
        createdAt: Date.now(),
      },
    ];

    const result = await ScyllaDb.batchWriteItem("products", items);
    console.log("✅ BatchWrite successful:", result);
    console.log(`   Inserted: ${result.inserted.length} items`);
    console.log(`   Failed: ${result.failed.length} items`);

    // Verify items were created
    for (const item of items) {
      const retrieved = await ScyllaDb.getItem("products", {
        id: item.id,
        category: item.category,
      });
      console.log(`✅ Verified: ${retrieved?.name}`);
    }
  } catch (error) {
    console.error("❌ BatchWrite failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

async function testBatchGetItem() {
  console.log("\n🧪 Testing batchGetItem...");

  try {
    // Test 1: Batch get with multiple keys
    console.log("\n1️⃣ Batch get with multiple keys:");

    const keys = [
      { id: "batch001", category: "electronics" },
      { id: "batch002", category: "books" },
      { id: "batch003", category: "clothing" },
      { id: "nonexistent", category: "electronics" }, // This should not be found
    ];

    const result = await ScyllaDb.batchGetItem("products", keys);
    console.log("✅ BatchGet successful");
    console.log(
      `✅ Retrieved ${result.filter((item) => item !== null).length} items`
    );

    result.forEach((item, index) => {
      if (item) {
        console.log(`   ${index + 1}. ${item.name}: $${item.price}`);
      } else {
        console.log(`   ${index + 1}. Not found: ${keys[index].id}`);
      }
    });
  } catch (error) {
    console.error("❌ BatchGet failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

async function testBatchOperationsWithErrors() {
  console.log("\n🧪 Testing batch operations with errors...");

  try {
    // Test 1: Batch write with invalid items
    console.log("\n1️⃣ Batch write with invalid items:");

    const invalidItems = [
      {
        id: "invalid001",
        // Missing category (SK) - should fail validation
        name: "Invalid Product 1",
        price: 99.99,
      },
      {
        id: "valid001",
        category: "electronics",
        name: "Valid Product 1",
        price: 199.99,
        stock: 10,
        createdAt: Date.now(),
      },
    ];

    try {
      const result = await ScyllaDb.batchWriteItem("products", invalidItems);
      console.log("❌ Should have failed validation");
    } catch (error) {
      console.log("✅ Correctly failed validation:", error.message);
    }

    // Test 2: Batch get with invalid keys
    console.log("\n2️⃣ Batch get with invalid keys:");

    const invalidKeys = [
      { id: "valid001", category: "electronics" },
      { id: "invalid002" }, // Missing category (SK)
    ];

    try {
      const result = await ScyllaDb.batchGetItem("products", invalidKeys);
      console.log("❌ Should have failed validation");
    } catch (error) {
      console.log("✅ Correctly failed validation:", error.message);
    }
  } catch (error) {
    console.error("❌ Batch operations error test failed:", error.message);
  }
}

// ============================================================
// MULTIPLE OPERATIONS SIMULATION (TRANSACTION ALTERNATIVE)
// ============================================================

async function testMultipleOperationsSimulation() {
  console.log(
    "\n🧪 Testing multiple operations simulation (transaction alternative)..."
  );

  try {
    // Test 1: Multiple operations using existing methods
    console.log("\n1️⃣ Multiple operations using existing methods:");

    // Create test items using putItem
    const item1 = {
      id: "multi001",
      category: "electronics",
      name: "Multi Op Test 1",
      price: 199.99,
      stock: 10,
      createdAt: Date.now(),
    };

    const item2 = {
      id: "multi002",
      category: "books",
      name: "Multi Op Test 2",
      price: 15.99,
      stock: 25,
      createdAt: Date.now(),
    };

    console.log("Putting item 1...");
    await ScyllaDb.putItem("products", item1);
    console.log("✅ Item 1 created");

    console.log("Putting item 2...");
    await ScyllaDb.putItem("products", item2);
    console.log("✅ Item 2 created");

    // Verify both items
    const retrieved1 = await ScyllaDb.getItem("products", {
      id: "multi001",
      category: "electronics",
    });
    const retrieved2 = await ScyllaDb.getItem("products", {
      id: "multi002",
      category: "books",
    });

    console.log("✅ Verified item 1:", retrieved1?.name);
    console.log("✅ Verified item 2:", retrieved2?.name);

    // Test 2: Update operations
    console.log("\n2️⃣ Update operations:");

    console.log("Updating item 1...");
    const updated1 = await ScyllaDb.updateItem(
      "products",
      { id: "multi001", category: "electronics" },
      {
        price: 179.99,
        updatedAt: Date.now(),
      }
    );
    console.log("✅ Item 1 updated:", updated1?.price);

    console.log("Updating item 2...");
    const updated2 = await ScyllaDb.updateItem(
      "products",
      { id: "multi002", category: "books" },
      {
        stock: 30,
        updatedAt: Date.now(),
      }
    );
    console.log("✅ Item 2 updated:", updated2?.stock);

    // Test 3: Delete operations
    console.log("\n3️⃣ Delete operations:");

    console.log("Deleting item 1...");
    await ScyllaDb.deleteItem("products", {
      id: "multi001",
      category: "electronics",
    });
    console.log("✅ Item 1 deleted");

    console.log("Deleting item 2...");
    await ScyllaDb.deleteItem("products", {
      id: "multi002",
      category: "books",
    });
    console.log("✅ Item 2 deleted");

    // Verify deletion
    const deleted1 = await ScyllaDb.getItem("products", {
      id: "multi001",
      category: "electronics",
    });
    const deleted2 = await ScyllaDb.getItem("products", {
      id: "multi002",
      category: "books",
    });

    console.log("✅ Verified item 1 deleted:", deleted1 === null);
    console.log("✅ Verified item 2 deleted:", deleted2 === null);

    console.log("✅ Multiple operations simulation completed successfully");
  } catch (error) {
    console.error("❌ Multiple operations simulation failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

// ============================================================
// VALIDATION TESTS
// ============================================================

async function testValidateKeys() {
  console.log("\n🧪 Testing validateKeys...");

  try {
    // Test 1: Valid keys
    console.log("\n1️⃣ Testing valid keys:");
    const validKey = { id: "test001", category: "electronics" };
    const isValid = ScyllaDb.validateKeys("products", validKey);
    console.log("✅ Valid keys passed:", isValid);

    // Test 2: Missing PK
    console.log("\n2️⃣ Testing missing PK:");
    try {
      const invalidKey1 = { category: "electronics" };
      ScyllaDb.validateKeys("products", invalidKey1);
      console.log("❌ Should have failed - missing PK");
    } catch (error) {
      console.log("✅ Correctly failed - missing PK:", error.message);
    }

    // Test 3: Missing SK
    console.log("\n3️⃣ Testing missing SK:");
    try {
      const invalidKey2 = { id: "test001" };
      ScyllaDb.validateKeys("products", invalidKey2);
      console.log("❌ Should have failed - missing SK");
    } catch (error) {
      console.log("✅ Correctly failed - missing SK:", error.message);
    }

    // Test 4: Wrong PK name
    console.log("\n4️⃣ Testing wrong PK name:");
    try {
      const invalidKey3 = { productId: "test001", category: "electronics" };
      ScyllaDb.validateKeys("products", invalidKey3);
      console.log("❌ Should have failed - wrong PK name");
    } catch (error) {
      console.log("✅ Correctly failed - wrong PK name:", error.message);
    }

    // Test 5: Wrong SK name
    console.log("\n5️⃣ Testing wrong SK name:");
    try {
      const invalidKey4 = { id: "test001", productCategory: "electronics" };
      ScyllaDb.validateKeys("products", invalidKey4);
      console.log("❌ Should have failed - wrong SK name");
    } catch (error) {
      console.log("✅ Correctly failed - wrong SK name:", error.message);
    }
  } catch (error) {
    console.error("❌ ValidateKeys test failed:", error.message);
  }
}

async function testIsMarshalledItem() {
  console.log("\n🧪 Testing isMarshalledItem...");

  try {
    // Test 1: Marshalled item
    console.log("\n1️⃣ Testing marshalled item:");
    const marshalledItem = {
      id: { S: "test001" },
      category: { S: "electronics" },
      name: { S: "Test Product" },
      price: { N: "99.99" },
    };
    const isMarshalled = ScyllaDb.isMarshalledItem(marshalledItem);
    console.log("✅ Marshalled item detected:", isMarshalled);

    // Test 2: Non-marshalled item
    console.log("\n2️⃣ Testing non-marshalled item:");
    const normalItem = {
      id: "test001",
      category: "electronics",
      name: "Test Product",
      price: 99.99,
    };
    const isNotMarshalled = ScyllaDb.isMarshalledItem(normalItem);
    console.log("✅ Non-marshalled item detected:", !isNotMarshalled);

    // Test 3: Null input
    console.log("\n3️⃣ Testing null input:");
    const nullResult = ScyllaDb.isMarshalledItem(null);
    console.log("✅ Null input handled:", nullResult);

    // Test 4: Undefined input
    console.log("\n4️⃣ Testing undefined input:");
    const undefinedResult = ScyllaDb.isMarshalledItem(undefined);
    console.log("✅ Undefined input handled:", undefinedResult);
  } catch (error) {
    console.error("❌ IsMarshalledItem test failed:", error.message);
  }
}

// ============================================================
// TABLE MANAGEMENT TESTS
// ============================================================

async function testListTables() {
  console.log("\n🧪 Testing listTables...");

  try {
    const tables = await ScyllaDb.listTables();
    console.log("✅ Tables found:", tables);
    console.log(`✅ Total tables: ${tables.TableNames?.length || 0}`);

    if (tables.TableNames) {
      tables.TableNames.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table}`);
      });
    }
  } catch (error) {
    console.error("❌ ListTables failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

async function testDescribeTable() {
  console.log("\n🧪 Testing describeTable...");

  try {
    const tableDescription = await ScyllaDb.describeTable("products");

    // First, let's see the actual response structure
    console.log("🔍 Raw response structure:");
    console.log("   Response keys:", Object.keys(tableDescription));
    if (tableDescription.Table) {
      console.log("   Table object keys:", Object.keys(tableDescription.Table));
      console.log(
        "   Full Table object:",
        JSON.stringify(tableDescription.Table, null, 2)
      );
    } else {
      console.log("   No Table object found in response");
      console.log(
        "   Full response:",
        JSON.stringify(tableDescription, null, 2)
      );
    }

    console.log("\n✅ Table description:");

    // Handle different possible response structures
    const table = tableDescription.Table || tableDescription;

    console.log("   Table Name:", table.TableName || "Not available");
    console.log(
      "   Item Count:",
      table.ItemCount || table.NumberOfItems || "Not available"
    );
    console.log(
      "   Table Size:",
      table.TableSizeBytes || table.SizeBytes || "Not available"
    );
    console.log("   Table Status:", table.TableStatus || "Not available");
    console.log(
      "   Creation Date:",
      table.CreationDateTime || table.CreationDate || "Not available"
    );

    if (table.KeySchema) {
      console.log("   Key Schema:");
      table.KeySchema.forEach((key, index) => {
        console.log(`     ${index + 1}. ${key.AttributeName} (${key.KeyType})`);
      });
    } else {
      console.log("   Key Schema: Not available");
    }

    if (table.AttributeDefinitions) {
      console.log("   Attribute Definitions:");
      table.AttributeDefinitions.forEach((attr, index) => {
        console.log(
          `     ${index + 1}. ${attr.AttributeName} (${attr.AttributeType})`
        );
      });
    } else {
      console.log("   Attribute Definitions: Not available");
    }

    // Show any other properties that might be available
    const knownProps = [
      "TableName",
      "ItemCount",
      "TableSizeBytes",
      "TableStatus",
      "CreationDateTime",
      "KeySchema",
      "AttributeDefinitions",
    ];
    const otherProps = Object.keys(table).filter(
      (key) => !knownProps.includes(key)
    );
    if (otherProps.length > 0) {
      console.log("   Other Properties:", otherProps);
    }
  } catch (error) {
    console.error("❌ DescribeTable failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

async function testLoadTableConfigs() {
  console.log("\n🧪 Testing loadTableConfigs...");

  try {
    // Test 1: Load from file
    console.log("\n1️⃣ Loading from file:");
    const result = await ScyllaDb.loadTableConfigs("./config/tables.json");
    console.log("✅ Table configs loaded:", result);

    // Test 2: Get schema from config
    console.log("\n2️⃣ Getting schema from config:");
    const schema = ScyllaDb.getSchemaFromConfig("products");
    console.log("✅ Schema for products table:");
    console.log("   PK:", schema.PK);
    console.log("   SK:", schema.SK);
    console.log("   Columns:", Object.keys(schema.columns).length);
  } catch (error) {
    console.error("❌ LoadTableConfigs failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

async function testCreateDbFromConfig() {
  console.log("\n🧪 Testing createDbFromConfig...");

  try {
    // This method might not exist, so we'll test if it's available
    if (typeof ScyllaDb.createDbFromConfig === "function") {
      const result = await ScyllaDb.createDbFromConfig("./config/tables.json");
      console.log("✅ CreateDbFromConfig successful:", result);
    } else {
      console.log("ℹ️ createDbFromConfig method not available");
    }
  } catch (error) {
    console.error("❌ CreateDbFromConfig failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
  }
}

// ============================================================
// GSI (GLOBAL SECONDARY INDEX) TESTS
// ============================================================

async function testGSI() {
  console.log("\n🧪 Testing GSI functionality...");

  try {
    // Test 1: Create table with GSI
    console.log("\n1️⃣ Creating table with GSI:");

    const tableWithGSI = {
      TableName: "products_with_gsi",
      KeySchema: [
        { AttributeName: "id", KeyType: "HASH" },
        { AttributeName: "category", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "category", AttributeType: "S" },
        { AttributeName: "brand", AttributeType: "S" },
        { AttributeName: "price", AttributeType: "N" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "BrandIndex",
          KeySchema: [
            { AttributeName: "brand", KeyType: "HASH" },
            { AttributeName: "price", KeyType: "RANGE" },
          ],
          Projection: {
            ProjectionType: "ALL",
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    };

    try {
      await ScyllaDb.createTable(tableWithGSI);
      console.log("✅ Table with GSI created successfully");

      // Test 2: Query using GSI
      console.log("\n2️⃣ Querying using GSI:");

      // Insert test data
      const testItems = [
        {
          id: "gsi001",
          category: "electronics",
          brand: "Apple",
          name: "iPhone 15",
          price: 999.99,
        },
        {
          id: "gsi002",
          category: "electronics",
          brand: "Samsung",
          name: "Galaxy S24",
          price: 899.99,
        },
        {
          id: "gsi003",
          category: "electronics",
          brand: "Apple",
          name: "MacBook Pro",
          price: 1999.99,
        },
      ];

      for (const item of testItems) {
        await ScyllaDb.putItem("products_with_gsi", item);
      }
      console.log("✅ Test data inserted");

      // Query by brand using GSI
      const brandQuery = await ScyllaDb.query(
        "products_with_gsi",
        "brand = :brand",
        { ":brand": "Apple" },
        { IndexName: "BrandIndex" }
      );

      console.log("✅ GSI query successful");
      console.log(`✅ Found ${brandQuery.length} Apple products`);
      brandQuery.forEach((item) => {
        console.log(`   - ${item.name}: $${item.price}`);
      });
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("ℹ️ Table with GSI already exists");
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("❌ GSI test failed:", error.message);
  }
}

// ============================================================
// TRANSACTION TESTS (USING NEW METHODS)
// ============================================================

async function testTransactWrite() {
  console.log("\n🧪 Testing transactWrite (new method)...");

  try {
    // Test 1: Multiple operations in a transaction
    console.log("\n1️⃣ Multiple operations in a transaction:");

    const operations = [
      {
        table: "products",
        action: "put",
        item: {
          id: "transact001",
          category: "electronics",
          name: "Transaction Test Product 1",
          price: 299.99,
          stock: 10,
          createdAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "put",
        item: {
          id: "transact002",
          category: "books",
          name: "Transaction Test Product 2",
          price: 19.99,
          stock: 50,
          createdAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "update",
        key: { id: "transact001", category: "electronics" },
        data: {
          price: 279.99,
          updatedAt: Date.now(),
        },
      },
    ];

    const result = await ScyllaDb.transactWrite(operations, {
      rollbackOnFailure: true,
    });

    console.log("✅ TransactWrite successful:", result.message);
    console.log(
      `   Operations completed: ${
        result.results.filter((r) => r.success).length
      }`
    );

    // Verify items were created/updated
    const item1 = await ScyllaDb.getItem("products", {
      id: "transact001",
      category: "electronics",
    });
    const item2 = await ScyllaDb.getItem("products", {
      id: "transact002",
      category: "books",
    });

    console.log("✅ Verified item 1:", item1?.name, "- Price:", item1?.price);
    console.log("✅ Verified item 2:", item2?.name, "- Price:", item2?.price);
  } catch (error) {
    console.error("❌ TransactWrite failed:", error.message);
  }
}

async function testTransactGet() {
  console.log("\n🧪 Testing transactGet (new method)...");

  try {
    // Test 1: Multiple get operations in a transaction
    console.log("\n1️⃣ Multiple get operations in a transaction:");

    const operations = [
      {
        table: "products",
        key: { id: "transact001", category: "electronics" },
      },
      {
        table: "products",
        key: { id: "transact002", category: "books" },
      },
      {
        table: "products",
        key: { id: "nonexistent", category: "electronics" }, // This should return null
      },
    ];

    const result = await ScyllaDb.transactGet(operations, {
      consistentRead: false,
    });

    console.log("✅ TransactGet successful:", result.message);
    console.log(
      `   Items retrieved: ${
        result.results.filter((r) => r.item !== null).length
      }`
    );

    result.results.forEach((itemResult, index) => {
      if (itemResult.item) {
        console.log(
          `   ${index + 1}. ${itemResult.item.name}: $${itemResult.item.price}`
        );
      } else {
        console.log(`   ${index + 1}. Not found: ${operations[index].key.id}`);
      }
    });
  } catch (error) {
    console.error("❌ TransactGet failed:", error.message);
  }
}

async function testTransactWriteWithRollback() {
  console.log("\n🧪 Testing transactWrite with rollback...");

  try {
    // Test 1: Transaction that will fail and rollback
    console.log("\n1️⃣ Transaction with rollback on failure:");

    // First, create a test item
    const testItem = {
      id: "rollback001",
      category: "electronics",
      name: "Rollback Test Item",
      price: 100.0,
      stock: 5,
      createdAt: Date.now(),
    };

    await ScyllaDb.putItem("products", testItem);
    console.log("✅ Created test item for rollback test");

    const operations = [
      {
        table: "products",
        action: "update",
        key: { id: "rollback001", category: "electronics" },
        data: {
          price: 150.0,
          updatedAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "put",
        item: {
          id: "rollback002",
          category: "books",
          name: "Rollback Test Item 2",
          price: 25.0,
          stock: 10,
          createdAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "update",
        key: { id: "nonexistent", category: "electronics" }, // This will fail
        data: {
          price: 200.0,
        },
      },
    ];

    try {
      const result = await ScyllaDb.transactWrite(operations, {
        rollbackOnFailure: true,
      });
      console.log("❌ Should have failed");
    } catch (error) {
      console.log("✅ Transaction failed as expected:", error.message);

      // Verify rollback worked
      const originalItem = await ScyllaDb.getItem("products", {
        id: "rollback001",
        category: "electronics",
      });
      const newItem = await ScyllaDb.getItem("products", {
        id: "rollback002",
        category: "books",
      });

      console.log("✅ Original item price restored:", originalItem?.price);
      console.log("✅ New item was rolled back:", newItem === null);
    }
  } catch (error) {
    console.error("❌ TransactWrite rollback test failed:", error.message);
  }
}

async function testTransactWriteMixedOperations() {
  console.log("\n🧪 Testing transactWrite with mixed operations...");

  try {
    // Test 1: Mixed operations (put, update, delete)
    console.log("\n1️⃣ Mixed operations transaction:");

    // Create items first
    const item1 = {
      id: "mixed001",
      category: "electronics",
      name: "Mixed Test 1",
      price: 100.0,
      stock: 5,
      createdAt: Date.now(),
    };

    const item2 = {
      id: "mixed002",
      category: "books",
      name: "Mixed Test 2",
      price: 20.0,
      stock: 10,
      createdAt: Date.now(),
    };

    await ScyllaDb.putItem("products", item1);
    await ScyllaDb.putItem("products", item2);
    console.log("✅ Created test items for mixed operations");

    const operations = [
      {
        table: "products",
        action: "put",
        item: {
          id: "mixed003",
          category: "clothing",
          name: "Mixed Test 3",
          price: 50.0,
          stock: 15,
          createdAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "update",
        key: { id: "mixed001", category: "electronics" },
        data: {
          price: 120.0,
          updatedAt: Date.now(),
        },
      },
      {
        table: "products",
        action: "delete",
        key: { id: "mixed002", category: "books" },
      },
    ];

    const result = await ScyllaDb.transactWrite(operations, {
      rollbackOnFailure: true,
    });

    console.log("✅ Mixed operations transaction successful:", result.message);

    // Verify results
    const newItem = await ScyllaDb.getItem("products", {
      id: "mixed003",
      category: "clothing",
    });
    const updatedItem = await ScyllaDb.getItem("products", {
      id: "mixed001",
      category: "electronics",
    });
    const deletedItem = await ScyllaDb.getItem("products", {
      id: "mixed002",
      category: "books",
    });

    console.log("✅ New item created:", newItem?.name);
    console.log("✅ Item updated:", updatedItem?.price);
    console.log("✅ Item deleted:", deletedItem === null);
  } catch (error) {
    console.error("❌ Mixed operations test failed:", error.message);
  }
}

// ============================================================
// MAIN FUNCTION - UNCOMMENT TESTS TO RUN
// ============================================================

async function main() {
  try {
    // Load table configurations
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

    // Transaction Tests (New Methods)
    // await testTransactWrite();
    // await testTransactGet();
    // await testTransactWriteWithRollback();
    // await testTransactWriteMixedOperations();

    // Batch Operation Tests (Transaction Alternatives)
    // await testBatchWriteItem();
    // await testBatchGetItem();
    // await testBatchOperationsWithErrors();

    // Multiple Operations Simulation (Transaction Alternative)
    // await testMultipleOperationsSimulation();

    // Validation Tests
    // await testValidateKeys();
    // await testIsMarshalledItem();

    // Table Management Tests
    // await testListTables();
    // await testDescribeTable();

    // table prepare tests
    // await testLoadTableConfigs();
    // await testCreateDbFromConfig();

    // GSI Tests
    await testGSI();

    console.log("\n🎉 All selected tests completed!");
  } catch (error) {
    console.error("❌ Main function failed:", error.message);
    console.error("Error details:", {
      httpStatus: error.httpStatus,
      awsType: error.awsType,
      awsMsg: error.awsMsg,
    });
    process.exit(1);
  }
}

// Run the main function
main();
