import crypto from "crypto";
import { promises as fs } from "fs";
import http from "http";
import https from "https";
import { pathToFileURL } from "url";

/**
 * ScyllaDb - Node.js client for ScyllaDB with Alternator endpoint
 * Provides DynamoDB-compatible operations with high performance
 */
export default class ScyllaDb {
  /* ---------- configurable defaults ---------- */
  static DEFAULT_RETRIES = 3;
  static INITIAL_BACKOFF_MS = 100;;
  static DEFAULT_PORT = 8000;
  static CONTENT_TYPE = "application/x-amz-json-1.0";

  /* ---------- private in-memory state ---------- */
  static #errors = [];
  static #tableConfigs = {};
  static #cache = { getItem: {}, scan: {}, describe: {} };
  static #persistentAgent = null; // Will be initialized based on protocol
  static #customRequestOptions = {};

  /* ---------- runtime config ---------- */
  static #config = {
    endpoint:
      process.env.SCYLLA_ALTERNATOR_ENDPOINT ?? "https://i7wrvsvkgmteuu4co2sd3r5tle0cxpwf.lambda-url.ap-northeast-1.on.aws",
    port: ScyllaDb.DEFAULT_PORT,
    retries: ScyllaDb.DEFAULT_RETRIES,
    backoff: ScyllaDb.INITIAL_BACKOFF_MS,
    region: process.env.SCYLLA_ACCESS_REGION ?? "ap-northeast",
    key: process.env.SCYLLA_ACCESS_KEY ?? "",
    secret: process.env.SCYLLA_ACCESS_PASSWORD ?? "",
    enableCache: process.env.ENABLE_CACHE === "true",
  };

  /* ============================================================
   *  Low-level helpers
   * ========================================================== */

  /**
   * Sign AWS request for Alternator authentication
   */
  static signAwsRequest(target, payloadJson, amzDate, dateStamp) {
    if (!target || !payloadJson || !amzDate || !dateStamp) {
      throw new Error("signAwsRequest: missing required parameters");
    }

    const { key: accessKey, secret: secretKey, region } = ScyllaDb.#config;
    const service = "dynamodb";
    const host = `dynamodb.${region}.amazonaws.com`;
    const amzTarget = `DynamoDB_20120810.${target}`;

    /* ----- canonical request ------------------------------------------------ */
    const payloadHash = crypto
      .createHash("sha256")
      .update(payloadJson, "utf8")
      .digest("hex");

    const canonicalHeaders =
      `content-type:${ScyllaDb.CONTENT_TYPE}\n` +
      `host:${host}\n` +
      `x-amz-date:${amzDate}\n` +
      `x-amz-target:${amzTarget}\n`;

    const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    /* ----- string to sign --------------------------------------------------- */
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto
        .createHash("sha256")
        .update(canonicalRequest, "utf8")
        .digest("hex"),
    ].join("\n");

    /* ----- signing key derivation ------------------------------------------ */
    const hmac = (key, data) =>
      crypto.createHmac("sha256", key).update(data, "utf8").digest();

    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, "aws4_request");

    const signature = crypto
      .createHmac("sha256", kSigning)
      .update(stringToSign, "utf8")
      .digest("hex");

    const authorizationHeader =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      "Content-Type": ScyllaDb.CONTENT_TYPE,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": amzTarget,
      Authorization: authorizationHeader,
    };
  }

  /**
   * Low-level signed request with retry & back-off
   */
  static async request(
    target,
    payload = {},
    port = ScyllaDb.#config.port,
    agent = null
  ) {
    if (
      !target ||
      typeof payload !== "object" ||
      !Number.isInteger(port) ||
      port <= 0
    ) {
      throw new TypeError("ScyllaDb.request invalid arguments");
    }

    let attempt = 0;
    let backoff = ScyllaDb.#config.backoff;
    const maxTry = ScyllaDb.#config.retries;

    const payloadJson = Object.keys(payload).length
      ? JSON.stringify(payload)
      : "{}";

    const baseUrl = new URL(ScyllaDb.#config.endpoint);
    if (port) baseUrl.port = String(port);

    const transport = baseUrl.protocol === "https:" ? https : http;
    const defaultPort = baseUrl.protocol === "https:" ? 443 : 80;

    const useAgent =
      baseUrl.protocol === "https:"
        ? agent || ScyllaDb.#persistentAgent
        : undefined;

    while (true) {
      attempt += 1;

      const now = new Date();
      const amzDate = now
        .toISOString()
        .replace(/[:-]|\.\d{3}/g, "")
        .replace("Z", "Z");
      const dateStamp = amzDate.slice(0, 8);

      const signedHdrs = ScyllaDb.signAwsRequest(
        target,
        payloadJson,
        amzDate,
        dateStamp
      );

      const headers = {
        ...signedHdrs,
        "Content-Length": Buffer.byteLength(payloadJson),
        ...ScyllaDb.#customRequestOptions.headers,
      };

      const reqOptions = {
        method: "POST",
        hostname: baseUrl.hostname,
        port: baseUrl.port || defaultPort,
        path: baseUrl.pathname || "/",
        headers,
        agent: useAgent,
        timeout: 1000,
        ...ScyllaDb.#customRequestOptions,
      };

      // console.log("requesting...", reqOptions);

      try {
        const body = await new Promise((resolve, reject) => {
          const req = transport.request(reqOptions, (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () =>
              resolve({ status: res.statusCode, body: data })
            );
          });

          req.on("error", reject);
          req.write(payloadJson);
          // console.log("request bodyl...", payloadJson)
          req.end();
        });

        const { status, body: raw } = body;
        const parsed = raw ? JSON.parse(raw) : {};

        if (status === 200) {
          return parsed;
        }

        const errorType = parsed?.__type ?? "";
        const throttled =
          status === 400 &&
          errorType.includes("ProvisionedThroughputExceededException");

        if ((throttled || status >= 500) && attempt < maxTry) {
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }

        const awsMsg = parsed?.message ?? "";
        const whatFailed = [errorType, awsMsg].filter(Boolean).join(" – ");
        const err = new Error(
          `ScyllaDb ${target} failed: ${whatFailed || status} (HTTP ${status})`
        );
        err.httpStatus = status;
        err.awsType = errorType;
        err.awsMsg = awsMsg;
        ScyllaDb.#errors.push({
          target,
          httpCode: status,
          awsErrorType: errorType,
          awsErrorMsg: awsMsg,
          responseBody: raw,
          parsedResponse: parsed,
          payload: payloadJson,
          headers,
        });
        throw err;
      } catch (netErr) {
        if (attempt < maxTry) {
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }

        ScyllaDb.#errors.push({
          target,
          httpCode: 0,
          curlError: netErr.message,
          payload: payloadJson,
          headers,
        });
        throw netErr;
      }
    }
  }

  /* ============================================================
   *  Schema / meta
   * ========================================================== */

  /**
   * Describe table structure
   */
  static async describeTable(table) {
    if (!table) {
      throw new TypeError("describeTable: table name must not be empty");
    }

    if (!ScyllaDb.#cache.describe[table]) {
      const resp = await ScyllaDb.request(
        "DescribeTable",
        { TableName: table },
        ScyllaDb.#config.port
      );
      ScyllaDb.#cache.describe[table] = resp;
    }

    return ScyllaDb.#cache.describe[table];
  }

  /**
   * List all table names
   */
  static async listTables() {
    const resp = await ScyllaDb.request(
      "ListTables",
      {},
      ScyllaDb.#config.port
    );
    return resp.TableNames ?? [];
  }

  /**
   * Create a new table
   */
  static async createTable(schema) {
    if (!schema?.TableName) {
      throw new TypeError("createTable: schema.TableName is required");
    }

    delete ScyllaDb.#cache.describe[schema.TableName];

    const resp = await ScyllaDb.request(
      "CreateTable",
      schema,
      ScyllaDb.#config.port
    );
    return resp;
  }

  /**
   * Delete a table
   */
  static async deleteTable(table) {
    if (!table) {
      throw new TypeError("deleteTable: table name must not be empty");
    }

    delete ScyllaDb.#cache.describe[table];

    const resp = await ScyllaDb.request(
      "DeleteTable",
      { TableName: table },
      ScyllaDb.#config.port
    );
    return resp;
  }

  /**
   * Load table configurations from file
   */
  static async loadTableConfigs(filePath) {
    if (!filePath) {
      throw new TypeError("loadTableConfigs: filePath is required");
    }

    let configs;
    const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();

    try {
      if (ext === "json") {
        const raw = await fs.readFile(filePath, "utf8");
        configs = JSON.parse(raw);
      } else {
        const mod = await import(pathToFileURL(filePath).href);
        configs = mod.default ?? mod;
      }
    } catch (err) {
      throw new Error(`Config file not found or unreadable: ${filePath}`);
    }

    if (!configs || typeof configs !== "object" || Array.isArray(configs)) {
      throw new TypeError(
        "Config file must export an object (tableName → config)"
      );
    }

    ScyllaDb.#tableConfigs = configs;
    console.log("Table configs loaded", { count: Object.keys(configs).length });
  }

  /**
   * Get schema from loaded config
   */
  static getSchemaFromConfig(table) {
    if (!table) {
      throw new TypeError("getSchemaFromConfig: table name is required");
    }

    const cfg = ScyllaDb.#tableConfigs[table];
    if (!cfg) {
      throw new Error(`Table "${table}" not found in loaded configs`);
    }
    return cfg;
  }

  /**
   * Validate keys against table schema
   */
  static validateKeys(table, key) {
    if (!table) {
      throw new TypeError("validateKeys: table name is required");
    }
    if (!key || typeof key !== "object" || Array.isArray(key)) {
      throw new TypeError("validateKeys: key must be a non-null object:" + key);
    }

    const cfg = ScyllaDb.getSchemaFromConfig(table);

    const required = [cfg.PK];
    if (cfg.SK) required.push(cfg.SK);

    const missing = required.filter(
      (attr) => !(attr in key) || key[attr] === null || key[attr] === ""
    );

    if (missing.length) {
      throw new Error(
        `Missing required key attribute(s): ${missing.join(", ")}`
      );
    }

    return true;
  }

  /* ============================================================
   *  CRUD operations
   * ========================================================== */

  /**
   * Put item (insert or update)
   */
  static async putItem(table, item, options = {}, trackChange = false) {
    if (!table || !item || typeof item !== "object") {
      throw new TypeError("putItem: table name and item object are required");
    }

    const cfg = ScyllaDb.getSchemaFromConfig(table);
    const key = {
      [cfg.PK]: item[cfg.PK],
      ...(cfg.SK ? { [cfg.SK]: item[cfg.SK] } : {}),
    };
    ScyllaDb.validateKeys(table, key);

    const payload = {
      TableName: table,
      Item: ScyllaDb.marshalItem(item),
      ...(trackChange && { ReturnValues: "ALL_OLD" }),
      ...options,
    };

    const resp = await ScyllaDb.request(
      "PutItem",
      payload,
      ScyllaDb.#config.port
    );

    if (ScyllaDb.#config.enableCache) {
      delete ScyllaDb.#cache.getItem[ScyllaDb.#itemCacheKey(table, key)];
    }

    return trackChange
      ? resp.Attributes && Object.keys(resp.Attributes).length
        ? "updated"
        : "inserted"
      : true;
  }

  /**
   * Get item by key
   */
  static async getItem(table, key) {
    if (!table || !key || typeof key !== "object") {
      throw new TypeError("getItem: table name and key object are required");
    }
    ScyllaDb.validateKeys(table, key);

    const ck = ScyllaDb.#itemCacheKey(table, key);

    if (ScyllaDb.#config.enableCache && ScyllaDb.#cache.getItem[ck]) {
      return ScyllaDb.#cache.getItem[ck];
    }

    const resp = await ScyllaDb.request(
      "GetItem",
      { TableName: table, Key: ScyllaDb.marshalItem(key) },
      ScyllaDb.#config.port
    );

    if (!resp.Item) return false;

    const item = ScyllaDb.unmarshalItem(resp.Item);

    if (ScyllaDb.#config.enableCache) {
      ScyllaDb.#cache.getItem[ck] = item;
    }
    return item;
  }

  /**
   * Delete item
   */
  static async deleteItem(table, key, options = {}) {
    if (!table || !key || typeof key !== "object") {
      throw new TypeError("deleteItem: table name and key object are required");
    }
    ScyllaDb.validateKeys(table, key);

    const ck = ScyllaDb.#itemCacheKey(table, key);
    delete ScyllaDb.#cache.getItem[ck];

    const payload = {
      TableName: table,
      Key: ScyllaDb.marshalItem(key),
      ReturnValues: "ALL_OLD",
      ...options,
    };

    const resp = await ScyllaDb.request(
      "DeleteItem",
      payload,
      ScyllaDb.#config.port
    );
    return !!resp.Attributes;
  }

  /**
   * Update item
   */
  static async updateItem(table, key, data) {
    if (
      !table ||
      !key ||
      !data ||
      typeof key !== "object" ||
      typeof data !== "object"
    ) {
      throw new TypeError(
        "updateItem: table, key, and data objects are required"
      );
    }
    ScyllaDb.validateKeys(table, key);

    const exprNames = {};
    const exprValues = {};
    const parts = [];

    for (const [field, value] of Object.entries(data)) {
      const n = `#${field}`;
      const v = `:${field}`;
      exprNames[n] = field;
      exprValues[v] = value;
      parts.push(`${n} = ${v}`);
    }

    if (!parts.length) {
      throw new Error(
        "updateItem: data object must have at least one attribute"
      );
    }

    const payload = {
      TableName: table,
      Key: ScyllaDb.marshalItem(key),
      UpdateExpression: `SET ${parts.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: ScyllaDb.marshalItem(exprValues),
      ReturnValues: "ALL_NEW",
    };

    const resp = await ScyllaDb.request(
      "UpdateItem",
      payload,
      ScyllaDb.#config.port
    );
    const attrs = resp.Attributes
      ? ScyllaDb.unmarshalItem(resp.Attributes)
      : false;

    if (attrs && ScyllaDb.#config.enableCache) {
      ScyllaDb.#cache.getItem[ScyllaDb.#itemCacheKey(table, key)] = attrs;
    }

    return attrs;
  }

  /* ============================================================
   *  Batch operations
   * ========================================================== */

  /**
   * Batch write items (max 25)
   */
  static async batchWriteItem(table, items) {
    if (!table || !Array.isArray(items) || items.length === 0) {
      throw new TypeError(
        "batchWriteItem: table and non-empty items array required"
      );
    }
    if (items.length > 25) {
      throw new Error("BatchWriteItem limit is 25");
    }

    const cfg = ScyllaDb.getSchemaFromConfig(table);
    for (const it of items) {
      const key = {
        [cfg.PK]: it[cfg.PK],
        ...(cfg.SK ? { [cfg.SK]: it[cfg.SK] } : {}),
      };
      ScyllaDb.validateKeys(table, key);
    }

    const marshalled = items.map((it) => ({
      PutRequest: { Item: ScyllaDb.marshalItem(it) },
    }));
    const payload = { RequestItems: { [table]: marshalled } };

    const resp = await ScyllaDb.request(
      "BatchWriteItem",
      payload,
      ScyllaDb.#config.port
    );
    const unprocessed = resp.UnprocessedItems?.[table] ?? [];

    const unprocessedHashes = unprocessed.map((e) =>
      ScyllaDb.#md5(JSON.stringify(e.PutRequest.Item))
    );

    const results = { inserted: [], failed: [], unprocessed };

    items.forEach((it, i) => {
      const hash = ScyllaDb.#md5(JSON.stringify(ScyllaDb.marshalItem(it)));
      const id = it.id ?? `item_${i}`;

      if (unprocessedHashes.includes(hash)) {
        results.failed.push(id);
      } else {
        results.inserted.push(id);
      }
    });

    return results;
  }

  /**
   * Batch get items (max 25)
   */
  static async batchGetItem(table, keys) {
    if (!table || !Array.isArray(keys) || keys.length === 0) {
      throw new TypeError(
        "batchGetItem: table and non-empty keys array required"
      );
    }
    if (keys.length > 25) {
      throw new Error("BatchGetItem limit is 25");
    }

    keys.forEach((k) => ScyllaDb.validateKeys(table, k));

    const marshalledKeys = keys.map((k) => ScyllaDb.marshalItem(k));
    const payload = { RequestItems: { [table]: { Keys: marshalledKeys } } };

    const resp = await ScyllaDb.request(
      "BatchGetItem",
      payload,
      ScyllaDb.#config.port
    );
    const fetched = resp.Responses?.[table] ?? [];

    const itemsById = {};
    fetched.forEach((it) => {
      const u = ScyllaDb.unmarshalItem(it);
      if (u.id !== undefined) itemsById[u.id] = u;
    });

    return keys.map((k) => itemsById[k.id] ?? null);
  }

  /* ============================================================
   *  Transaction operations (simulated using batch operations)
   * ========================================================== */

  /**
   * Transaction write operations (simulated)
   * Since ScyllaDB Alternator doesn't support native transactions,
   * this method simulates transaction behavior using batch operations
   * with rollback capability on failure.
   */
  static async transactWrite(operations, options = {}) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new TypeError("transactWrite: operations array is required");
    }
    if (operations.length > 25) {
      throw new Error("TransactWrite limit is 25 operations");
    }

    const { rollbackOnFailure = true, retryAttempts = 3 } = options;
    const originalItems = new Map(); // Store original state for rollback
    const operationResults = [];

    try {
      // Phase 1: Validate all operations and store original state
      for (const operation of operations) {
        if (!operation.table || !operation.action) {
          throw new Error(
            "Each operation must have table and action properties"
          );
        }

        const { table, action, item, key, data } = operation;

        switch (action) {
          case "put":
            if (!item) throw new Error("Put operation requires item");
            const schema = ScyllaDb.getSchemaFromConfig(table);
            const putKey = { [schema.PK]: item[schema.PK] };
            if (schema.SK) {
              putKey[schema.SK] = item[schema.SK];
            }
            ScyllaDb.validateKeys(table, putKey);
            break;
          case "update":
            if (!key || !data)
              throw new Error("Update operation requires key and data");
            ScyllaDb.validateKeys(table, key);
            // Store original item for potential rollback
            if (rollbackOnFailure) {
              const original = await ScyllaDb.getItem(table, key);
              if (original) {
                originalItems.set(`${table}:${JSON.stringify(key)}`, original);
              }
            }
            break;
          case "delete":
            if (!key) throw new Error("Delete operation requires key");
            ScyllaDb.validateKeys(table, key);
            // Store original item for potential rollback
            if (rollbackOnFailure) {
              const original = await ScyllaDb.getItem(table, key);
              if (original) {
                originalItems.set(`${table}:${JSON.stringify(key)}`, original);
              }
            }
            break;
          default:
            throw new Error(`Unsupported action: ${action}`);
        }
      }

      // Phase 2: Execute operations
      for (const operation of operations) {
        const { table, action, item, key, data } = operation;
        let result;

        try {
          switch (action) {
            case "put":
              result = await ScyllaDb.putItem(table, item);
              break;
            case "update":
              result = await ScyllaDb.updateItem(table, key, data);
              break;
            case "delete":
              result = await ScyllaDb.deleteItem(table, key);
              break;
          }
          operationResults.push({ success: true, operation, result });
        } catch (error) {
          operationResults.push({ success: false, operation, error });
          throw error; // Stop execution on first failure
        }
      }

      return {
        success: true,
        results: operationResults,
        message: "Transaction completed successfully",
      };
    } catch (error) {
      // Phase 3: Rollback if enabled and operations failed
      if (rollbackOnFailure && originalItems.size > 0) {
        console.warn("Transaction failed, attempting rollback...");

        try {
          for (const [itemKey, originalItem] of originalItems) {
            const [table, keyStr] = itemKey.split(":");
            const key = JSON.parse(keyStr);

            // Restore original item
            await ScyllaDb.putItem(table, originalItem);
          }
          console.log("Rollback completed successfully");
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError.message);
          throw new Error(
            `Transaction failed and rollback failed: ${error.message}. Rollback error: ${rollbackError.message}`
          );
        }
      }

      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  /**
   * Transaction get operations (simulated)
   * Since ScyllaDB Alternator doesn't support native transactions,
   * this method simulates transaction behavior using batch operations.
   */
  static async transactGet(operations, options = {}) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new TypeError("transactGet: operations array is required");
    }
    if (operations.length > 25) {
      throw new Error("TransactGet limit is 25 operations");
    }

    const { consistentRead = false } = options;
    const results = [];

    try {
      // Group operations by table for batch processing
      const tableOperations = new Map();

      for (const operation of operations) {
        if (!operation.table || !operation.key) {
          throw new Error("Each operation must have table and key properties");
        }

        const { table, key } = operation;
        ScyllaDb.validateKeys(table, key);

        if (!tableOperations.has(table)) {
          tableOperations.set(table, []);
        }
        tableOperations.get(table).push({ key, operation });
      }

      // Execute batch gets for each table
      for (const [table, ops] of tableOperations) {
        const keys = ops.map((op) => op.key);
        const batchResults = await ScyllaDb.batchGetItem(table, keys);

        // Map results back to original operations
        for (let i = 0; i < ops.length; i++) {
          results.push({
            success: true,
            operation: ops[i].operation,
            item: batchResults[i],
          });
        }
      }

      return {
        success: true,
        results,
        message: "Transaction get completed successfully",
      };
    } catch (error) {
      throw new Error(`Transaction get failed: ${error.message}`);
    }
  }

  /* ============================================================
   *  Query and Scan
   * ========================================================== */

  /**
   * Query items with conditions
   */
  static async query(table, keyConditionExpr, exprVals, options = {}) {
    if (!table || !keyConditionExpr || typeof exprVals !== "object") {
      throw new TypeError(
        "query: table, keyConditionExpr and exprVals are required"
      );
    }

    const base = {
      TableName: table,
      KeyConditionExpression: keyConditionExpr,
      ExpressionAttributeValues: ScyllaDb.marshalItem(exprVals),
    };

    let payload = { ...base, ...options };

    // Marshal additional ExpressionAttributeValues from options if present
    if (
      payload.ExpressionAttributeValues &&
      options.ExpressionAttributeValues
    ) {
      const additionalValues = ScyllaDb.marshalItem(
        options.ExpressionAttributeValues
      );
      payload.ExpressionAttributeValues = {
        ...payload.ExpressionAttributeValues,
        ...additionalValues,
      };
    }

    const items = [];

    do {
      const resp = await ScyllaDb.request(
        "Query",
        payload,
        ScyllaDb.#config.port
      );
      (resp.Items ?? []).forEach((it) =>
        items.push(ScyllaDb.unmarshalItem(it))
      );
      payload = {
        ...payload,
        ExclusiveStartKey: resp.LastEvaluatedKey ?? undefined,
      };
    } while (payload.ExclusiveStartKey);

    return items;
  }

  /**
   * Scan all items in table
   */
  static async scan(table, options = {}) {
    if (!table) {
      throw new TypeError("scan: table name is required");
    }

    let payload = {
      TableName: table,
      ...options,
    };

    // Marshal ExpressionAttributeValues if present
    if (payload.ExpressionAttributeValues) {
      payload.ExpressionAttributeValues = ScyllaDb.marshalItem(
        payload.ExpressionAttributeValues
      );
    }

    const items = [];

    do {
      const resp = await ScyllaDb.request(
        "Scan",
        payload,
        ScyllaDb.#config.port
      );
      (resp.Items ?? []).forEach((it) =>
        items.push(ScyllaDb.unmarshalItem(it))
      );
      payload = {
        ...payload,
        ExclusiveStartKey: resp.LastEvaluatedKey ?? undefined,
      };
    } while (payload.ExclusiveStartKey);

    return items;
  }

  /* ============================================================
   *  Configuration and utilities
   * ========================================================== */

  /**
   * Configure ScyllaDb settings
   */
  static configure(config = {}) {
    if (typeof config !== "object" || Array.isArray(config)) {
      throw new TypeError("configure: config must be an object");
    }
    ScyllaDb.#config = { ...ScyllaDb.#config, ...config };
    console.log("ScyllaDb config updated", { keys: Object.keys(config) });
    return true;
  }

  /**
   * Set custom request options
   */
  static setCurlOptions(opts = {}) {
    if (typeof opts !== "object" || Array.isArray(opts)) {
      throw new TypeError("setCurlOptions: opts must be an object");
    }
    const { headers = {}, ...rest } = opts;
    ScyllaDb.#customRequestOptions = { ...rest, headers };
    console.log("Custom request options set", { keys: Object.keys(rest) });
    return true;
  }

  /**
   * Begin persistent session
   */
  static beginSession() {
    const baseUrl = new URL(ScyllaDb.#config.endpoint);
    if (baseUrl.protocol === "https:" && !ScyllaDb.#persistentAgent) {
      ScyllaDb.#persistentAgent = new https.Agent({ keepAlive: true });
      console.log("Persistent HTTPS session started");
    } else if (baseUrl.protocol === "http:") {
      console.log("HTTP session - no persistent agent needed");
    }
  }

  /**
   * End persistent session
   */
  static endSession() {
    if (ScyllaDb.#persistentAgent) {
      ScyllaDb.#persistentAgent.destroy();
      ScyllaDb.#persistentAgent = null;
      console.log("Persistent HTTPS session closed");
    }
  }

  /**
   * Get error history
   */
  static getErrors() {
    return ScyllaDb.#errors;
  }

  /**
   * Clear cache
   */
  static clearCache(type = null) {
    if (!type) {
      ScyllaDb.#cache = { getItem: {}, scan: {}, describe: {} };
      console.log("All in-process caches cleared");
      return;
    }

    if (!(type in ScyllaDb.#cache)) {
      throw new Error(`clearCache: unknown cache bucket "${type}"`);
    }
    ScyllaDb.#cache[type] = {};
    console.log(`Cache bucket "${type}" cleared`);
  }

  /**
   * Raw request wrapper
   */
  static async rawRequest(target, payload = {}) {
    return ScyllaDb.request(target, payload, ScyllaDb.#config.port);
  }

  /* ============================================================
   *  Marshalling helpers
   * ========================================================== */

  /**
   * Marshal value to DynamoDB format
   */
  static marshalValue(v) {
    if (v === null || v === undefined) {
      return { NULL: true };
    }

    if (typeof v === "boolean") {
      return { BOOL: v };
    }
    if (typeof v === "number" || typeof v === "bigint") {
      return { N: v.toString() };
    }
    if (Array.isArray(v)) {
      return { L: v.map((el) => ScyllaDb.marshalValue(el)) };
    }
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = ScyllaDb.marshalValue(val);
      }
      return { M: out };
    }
    return { S: String(v) };
  }

  /**
   * Marshal item to DynamoDB format
   */
  static marshalItem(data) {
    if (typeof data !== "object" || data === null) {
      throw new TypeError("marshalItem expects a plain object");
    }

    const out = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = ScyllaDb.marshalValue(v);
    }
    return out;
  }

  /**
   * Check if item is marshalled
   */
  static isMarshalledItem(item) {
    if (!item || typeof item !== "object") return false;

    const VALID = ["S", "N", "BOOL", "NULL", "L", "M"];
    return Object.values(item).every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        Object.keys(v).length === 1 &&
        VALID.includes(Object.keys(v)[0])
    );
  }

  /**
   * Unmarshal item from DynamoDB format
   */
  static unmarshalItem(item) {
    if (!item || typeof item !== "object") return {};

    const out = {};

    const convert = (typed) => {
      const type = Object.keys(typed)[0];
      const val = typed[type];

      switch (type) {
        case "S":
          return val;
        case "N":
          return val.includes(".") ? parseFloat(val) : parseInt(val, 10);
        case "BOOL":
          return !!val;
        case "NULL":
          return null;
        case "L":
          return val.map((el) => convert(el));
        case "M": {
          const m = {};
          for (const [k, v] of Object.entries(val)) m[k] = convert(v);
          return m;
        }
        default:
          return val;
      }
    };

    for (const [k, typed] of Object.entries(item)) {
      out[k] = convert(typed);
    }
    return out;
  }

  /* ---------- private utilities ---------- */
  static #itemCacheKey(table, keyObj) {
    return `${table}:${JSON.stringify(keyObj)}`;
  }

  static #md5(json) {
    return crypto.createHash("md5").update(json).digest("hex");
  }
}
