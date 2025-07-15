/**
 * Redis Class
 * Manages Redis operations with environment-based client selection
 */

import redis from 'redis';
import Logger from '../Logger.js';
import ErrorHandler from '../ErrorHandler.js';

// Cached environment variables
let cachedEnvironment = null;
let cachedLambdaUrl = null;

/**
 * Get environment configuration
 * @returns {Object} Environment configuration
 */
function getEnvironment() {
  if (cachedEnvironment === null) {
    cachedEnvironment = {
      app: process.env.APP_ENVIRONMENT || 'development',
      lambdaUrl: process.env.LAMBDA_URL || null
    };
  }
  return cachedEnvironment;
}

/**
 * Get Lambda URL for development
 * @returns {string} Lambda URL
 */
function getLambdaUrl() {
  if (cachedLambdaUrl === null) {
    const env = getEnvironment();
    cachedLambdaUrl = env.lambdaUrl || 'https://i7wrvsvkgmteuu4co2sd3r5tle0cxpwf.lambda-url.ap-northeast-1.on.aws/';
  }
  return cachedLambdaUrl;
}

/**
 * Add environment command prefix
 * @param {string} command - Redis command
 * @returns {string} Command with environment prefix
 */
function addEnvCommandPrefix(command) {
  const env = getEnvironment();
  
  switch (env.app) {
    case 'development':
      return command.replace(/#/g, '#dev_');
    case 'stage':
      return command.replace(/#/g, '#stage_');
    case 'production':
      return command.replace(/#/g, '');
    default:
      return command.replace(/#/g, '#dev_');
  }
}

// Helper function for development Redis requests
async function RedisHttpProxy(redisCommand) {
  try {
    const lambdaUrl = getLambdaUrl();
    if (!lambdaUrl) {
      throw ErrorHandler.networkError('LAMBDA_URL not configured for development environment', null, { redisCommand });
    }
    
    const url = `${lambdaUrl}redis`;
    Logger.debug('Making Redis proxy request', { url, redisCommand });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ redisCommand })
    });
    
    if (!response.ok) {
      throw ErrorHandler.networkError(`HTTP ${response.status}: ${response.statusText}`, null, { 
        url, 
        redisCommand, 
        status: response.status 
      });
    }
    
    const data = await response.json();
    Logger.debug('Redis proxy request successful', { redisCommand, responseStatus: response.status });
    return data;
  } catch (error) {
    Logger.error('Redis proxy request failed', error, { redisCommand });
    throw error;
  }
}

// Static Redis client instance
let staticClient = null;
let isConnected = false;

// Main Redis Class
class RedisClass {
  /**
   * Initialize Redis class
   */
  static async initialize() {
    try {
      await Logger.initialize();
      Logger.info('Redis class initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis class:', error);
      return false;
    }
  }

  /**
   * Get current environment
   * @returns {string}
   */
  static getEnvironment() {
    return getEnvironment().app;
  }
  
  /**
   * Get current database number
   * @returns {number}
   */
  static getDatabase() {
    const env = getEnvironment().app;
    return env === 'production' ? 1 : 0;
  }
  
  /**
   * Get connection status
   * @returns {boolean}
   */
  static getConnectionStatus() {
    return isConnected;
  }
  
  /**
   * Connect to Redis
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>}
   */
  static async connect(options = {}) {
    try {
      const env = getEnvironment().app;
      Logger.info('Attempting to connect to Redis', { environment: env, database: RedisClass.getDatabase() });
      
      if (env === 'production' || env === 'stage') {
        // Use actual Redis client for production/stage
        const defaultOptions = {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD,
          db: RedisClass.getDatabase(),
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              return new Error('The server refused the connection');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              return new Error('Retry time exhausted');
            }
            if (options.attempt > 10) {
              return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
          }
        };
        
        const connectionOptions = { ...defaultOptions, ...options };
        staticClient = redis.createClient(connectionOptions);
        
        // Set up event listeners
        staticClient.on('connect', () => {
          Logger.success('Redis connected successfully');
          isConnected = true;
        });
        
        staticClient.on('error', (err) => {
          Logger.error('Redis connection error', err);
          isConnected = false;
        });
        
        staticClient.on('end', () => {
          Logger.warn('Redis connection ended');
          isConnected = false;
        });
        
        // Connect to Redis
        await staticClient.connect();
        
        // Select database
        await staticClient.select(RedisClass.getDatabase());
        Logger.info(`Redis connected to database ${RedisClass.getDatabase()}`);
        
      } else {
        // For development, just test the connection
        Logger.info('Redis development mode - using proxy');
        isConnected = true;
      }
      
      return true;
    } catch (error) {
      Logger.error('Failed to connect to Redis', error);
      isConnected = false;
      throw ErrorHandler.databaseError('Failed to connect to Redis', error);
    }
  }
  
  /**
   * Disconnect from Redis
   * @returns {Promise<boolean>}
   */
  static async disconnect() {
    try {
      if (staticClient && (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage')) {
        await staticClient.quit();
      }
      isConnected = false;
      Logger.success('Redis disconnected successfully');
      return true;
    } catch (error) {
      Logger.error('Failed to disconnect from Redis', error);
      isConnected = false;
      throw ErrorHandler.databaseError('Failed to disconnect from Redis', error);
    }
  }
  
  /**
   * Ping Redis server
   * @returns {Promise<string>}
   */
  static async ping() {
    try {
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        return await staticClient.ping();
      } else {
        Logger.debug('Redis PING via proxy');
        const command = addEnvCommandPrefix('ping()');
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error('Redis ping failed', error);
      throw error;
    }
  }
  
  /**
   * Set a key-value pair
   * @param {string} key - Redis key
   * @param {string|number|Object} value - Value to store
   * @param {Object} options - Additional options (expiry, etc.)
   * @returns {Promise<string>}
   */
  static async set(key, value, options = {}) {
    try {
      let stringValue = value;
      if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
      }
      
      Logger.debug('Setting Redis key', { key, valueType: typeof value, hasExpiry: !!options.expiry });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        
        if (options.expiry) {
          return await staticClient.setEx(key, options.expiry, stringValue);
        } else {
          return await staticClient.set(key, stringValue);
        }
      } else {
        Logger.debug('Redis SET via proxy', { key, value: stringValue });
        const command = addEnvCommandPrefix(`set(#${key}, '${stringValue}')`);
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error(`Failed to set key ${key}`, error, { key, valueType: typeof value });
      throw ErrorHandler.databaseError(`Failed to set key ${key}`, error, { key });
    }
  }
  
  /**
   * Get a value by key
   * @param {string} key - Redis key
   * @returns {Promise<string|null>}
   */
  static async get(key) {
    try {
      Logger.debug('Getting Redis key', { key });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        
        const result = await staticClient.get(key);
        
        // Try to parse as JSON if it looks like JSON
        if (result && (result.startsWith('{') || result.startsWith('['))) {
          try {
            return JSON.parse(result);
          } catch {
            return result;
          }
        }
        
        return result;
      } else {
        Logger.debug('Redis GET via proxy', { key });
        const command = addEnvCommandPrefix(`get(#${key})`);
        const result = await RedisHttpProxy(command);
        
        // Handle different response types from proxy
        if (result === null || result === undefined) {
          return null;
        }
        
        // If result is already an object, return it
        if (typeof result === 'object') {
          return result;
        }
        
        // If result is a string, try to parse as JSON
        if (typeof result === 'string') {
          if (result.startsWith('{') || result.startsWith('[')) {
            try {
              return JSON.parse(result);
            } catch {
              return result;
            }
          }
          return result;
        }
        
        return result;
      }
    } catch (error) {
      Logger.error(`Failed to get key ${key}`, error, { key });
      throw ErrorHandler.databaseError(`Failed to get key ${key}`, error, { key });
    }
  }
  
  /**
   * Get multiple values by keys
   * @param {...string} keys - Redis keys
   * @returns {Promise<Array>}
   */
  static async mget(...keys) {
    try {
      Logger.debug('Getting multiple Redis keys', { keys });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        
        const results = await staticClient.mGet(...keys);
        
        // Try to parse JSON values
        return results.map(result => {
          if (result && (result.startsWith('{') || result.startsWith('['))) {
            try {
              return JSON.parse(result);
            } catch {
              return result;
            }
          }
          return result;
        });
      } else {
        Logger.debug('Redis MGET via proxy', { keys });
        const keyArgs = keys.map(key => `#${key}`).join(', ');
        const command = addEnvCommandPrefix(`mget(${keyArgs})`);
        const results = await RedisHttpProxy(command);
        
        // Handle different response types from proxy
        if (!Array.isArray(results)) {
          Logger.warn('MGET returned non-array result', { results, expectedKeys: keys });
          return new Array(keys.length).fill(null);
        }
        
        // Try to parse JSON values
        return results.map(result => {
          if (result === null || result === undefined) {
            return null;
          }
          
          // If result is already an object, return it
          if (typeof result === 'object') {
            return result;
          }
          
          // If result is a string, try to parse as JSON
          if (typeof result === 'string') {
            if (result.startsWith('{') || result.startsWith('[')) {
              try {
                return JSON.parse(result);
              } catch {
                return result;
              }
            }
            return result;
          }
          
          return result;
        });
      }
    } catch (error) {
      Logger.error('Failed to get multiple keys', error, { keys });
      throw ErrorHandler.databaseError('Failed to get multiple keys', error, { keys });
    }
  }
  
  /**
   * Set multiple key-value pairs
   * @param {Object} keyValuePairs - Object with key-value pairs
   * @returns {Promise<string>}
   */
  static async mset(keyValuePairs) {
    try {
      Logger.debug('Setting multiple Redis keys', { keyCount: Object.keys(keyValuePairs).length });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        
        // Convert object values to strings
        const stringPairs = {};
        for (const [key, value] of Object.entries(keyValuePairs)) {
          stringPairs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
        }
        
        return await staticClient.mSet(stringPairs);
      } else {
        Logger.debug('Redis MSET via proxy', { keyCount: Object.keys(keyValuePairs).length });
        const args = [];
        for (const [key, value] of Object.entries(keyValuePairs)) {
          const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
          args.push(`#${key}`, `'${stringValue}'`);
        }
        const command = addEnvCommandPrefix(`mset(${args.join(', ')})`);
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error('Failed to set multiple keys', error, { keyCount: Object.keys(keyValuePairs).length });
      throw ErrorHandler.databaseError('Failed to set multiple keys', error, { keyCount: Object.keys(keyValuePairs).length });
    }
  }
  
  /**
   * Delete a key
   * @param {string} key - Redis key to delete
   * @returns {Promise<number>}
   */
  static async del(key) {
    try {
      Logger.debug('Deleting Redis key', { key });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        return await staticClient.del(key);
      } else {
        Logger.debug('Redis DEL via proxy', { key });
        const command = addEnvCommandPrefix(`del(#${key})`);
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error(`Failed to delete key ${key}`, error, { key });
      throw ErrorHandler.databaseError(`Failed to delete key ${key}`, error, { key });
    }
  }
  
  /**
   * Delete multiple keys
   * @param {...string} keys - Redis keys to delete
   * @returns {Promise<number>}
   */
  static async mdel(...keys) {
    try {
      Logger.debug('Deleting multiple Redis keys', { keys });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        return await staticClient.del(keys);
      } else {
        Logger.debug('Redis DEL multiple via proxy', { keys });
        const keyArgs = keys.map(key => `#${key}`).join(', ');
        const command = addEnvCommandPrefix(`del(${keyArgs})`);
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error('Failed to delete multiple keys', error, { keys });
      throw ErrorHandler.databaseError('Failed to delete multiple keys', error, { keys });
    }
  }
  
  /**
   * Check if key exists
   * @param {string} key - Redis key
   * @returns {Promise<boolean>}
   */
  static async exists(key) {
    try {
      Logger.debug('Checking if Redis key exists', { key });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        const result = await staticClient.exists(key);
        return result === 1;
      } else {
        Logger.debug('Redis EXISTS via proxy', { key });
        const command = addEnvCommandPrefix(`exists(#${key})`);
        const result = await RedisHttpProxy(command);
        return result === 1;
      }
    } catch (error) {
      Logger.error(`Failed to check existence of key ${key}`, error, { key });
      throw ErrorHandler.databaseError(`Failed to check existence of key ${key}`, error, { key });
    }
  }
  
  /**
   * Set key expiry
   * @param {string} key - Redis key
   * @param {number} seconds - Expiry time in seconds
   * @returns {Promise<boolean>}
   */
  static async expire(key, seconds) {
    try {
      Logger.debug('Setting Redis key expiry', { key, seconds });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        const result = await staticClient.expire(key, seconds);
        return result === 1;
      } else {
        Logger.debug('Redis EXPIRE via proxy', { key, seconds });
        const command = addEnvCommandPrefix(`expire(#${key}, ${seconds})`);
        const result = await RedisHttpProxy(command);
        return result === 1;
      }
    } catch (error) {
      Logger.error(`Failed to set expiry for key ${key}`, error, { key, seconds });
      throw ErrorHandler.databaseError(`Failed to set expiry for key ${key}`, error, { key, seconds });
    }
  }
  
  /**
   * Get key time to live
   * @param {string} key - Redis key
   * @returns {Promise<number>}
   */
  static async ttl(key) {
    try {
      Logger.debug('Getting Redis key TTL', { key });
      
      if (RedisClass.getEnvironment() === 'production' || RedisClass.getEnvironment() === 'stage') {
        if (!isConnected) {
          throw ErrorHandler.databaseError('Redis not connected');
        }
        return await staticClient.ttl(key);
      } else {
        Logger.debug('Redis TTL via proxy', { key });
        const command = addEnvCommandPrefix(`ttl(#${key})`);
        return await RedisHttpProxy(command);
      }
    } catch (error) {
      Logger.error(`Failed to get TTL for key ${key}`, error, { key });
      throw ErrorHandler.databaseError(`Failed to get TTL for key ${key}`, error, { key });
    }
  }
}

export default RedisClass;
