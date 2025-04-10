import ApiKeyManager from '../src/apiKeyManager';

const originalEnv = process.env;

describe('ApiKeyManager', () => {
  let apiKeyManager: ApiKeyManager;

  beforeEach(() => {
    process.env = { ...originalEnv }; // reset env
    (ApiKeyManager as any).instance = null;
    process.env.AUTH_TOKEN = 'key1,key2,key3';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  describe('initialization', () => {
    test('should throw error if no token is provided', () => {
      process.env.AUTH_TOKEN = '';
      expect(() => ApiKeyManager.getInstance()).toThrow('No token found');
    });

    test('should initialize with a single key', () => {
      process.env.AUTH_TOKEN = 'single_key';
      apiKeyManager = ApiKeyManager.getInstance();
      expect(apiKeyManager).toBeDefined();
    });

    test('should initialize with multiple keys', () => {
      apiKeyManager = ApiKeyManager.getInstance();
      expect(apiKeyManager).toBeDefined();
    });

    test('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = ApiKeyManager.getInstance();
      const instance2 = ApiKeyManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getKey', () => {
    beforeEach(() => {
      apiKeyManager = ApiKeyManager.getInstance();
    });

    test('should return the first key initially', async () => {
      const key = await apiKeyManager.getKey();
      expect(key).toBe('key1');
    });

    test('should continue using the same key if not rate limited', async () => {
      let key = await apiKeyManager.getKey();
      expect(key).toBe('key1');

      key = await apiKeyManager.getKey();
      expect(key).toBe('key1');

      key = await apiKeyManager.getKey();
      expect(key).toBe('key1');
    });

    test('should move to the next key when current key is rate limited', async () => {
      const key1 = await apiKeyManager.getKey();
      expect(key1).toBe('key1');

      apiKeyManager.markRateLimited('key1');

      const key2 = await apiKeyManager.getKey();
      expect(key2).toBe('key2');
    });

    test('should cycle through available keys when some are rate limited', async () => {
      apiKeyManager.markRateLimited('key1');
      apiKeyManager.markRateLimited('key3');

      const key = await apiKeyManager.getKey();
      expect(key).toBe('key2');
    });

    test('should throw error when all keys are rate limited', async () => {
      apiKeyManager.markRateLimited('key1');
      apiKeyManager.markRateLimited('key2');
      apiKeyManager.markRateLimited('key3');

      await expect(apiKeyManager.getKey()).rejects.toThrow('No API keys available');
    });

    test('should reuse a key after its rate limit expires', async () => {
      jest.useFakeTimers();

      apiKeyManager.markRateLimited('key1', 5);

      let key = await apiKeyManager.getKey();
      expect(key).toBe('key2');

      jest.advanceTimersByTime(6000); // 6s
      apiKeyManager.markRateLimited('key2');

      // should use key1 since its limit expired
      key = await apiKeyManager.getKey();
      expect(key).toBe('key1');
    });
  });

  describe('markRateLimited', () => {
    beforeEach(() => {
      apiKeyManager = ApiKeyManager.getInstance();
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      (console.warn as jest.Mock).mockRestore();
    });

    test('should mark a key as rate limited', async () => {
      apiKeyManager.markRateLimited('key1');
      const key = await apiKeyManager.getKey();
      expect(key).not.toBe('key1');
    });

    test('should use default retry time of 60 seconds if not specified', async () => {
      jest.useFakeTimers();

      apiKeyManager.markRateLimited('key1');
      jest.advanceTimersByTime(59000);

      // key1 should still be limited
      const key1 = await apiKeyManager.getKey();
      expect(key1).not.toBe('key1');
      jest.advanceTimersByTime(2000); // total 61s
      apiKeyManager.markRateLimited(key1);

      // key1 should now be available again
      const newKey = await apiKeyManager.getKey();
      expect(newKey).toBe('key1');
    });

    test('should use custom retry time when specified', async () => {
      jest.useFakeTimers();

      apiKeyManager.markRateLimited('key1', 10); // 10s
      jest.advanceTimersByTime(9000);

      // key1 should still be rate limited
      const key1 = await apiKeyManager.getKey();
      expect(key1).not.toBe('key1');
      jest.advanceTimersByTime(2000); // total 11s
      apiKeyManager.markRateLimited(key1);

      // key1 should now be available again
      const newKey = await apiKeyManager.getKey();
      expect(newKey).toBe('key1');
    });

    test('should log a warning when a key is marked as rate limited', () => {
      apiKeyManager.markRateLimited('key1');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('API key marked as rate limited')
      );
    });
  });

  describe('error message for all rate limited keys', () => {
    beforeEach(() => {
      apiKeyManager = ApiKeyManager.getInstance();
      jest.useFakeTimers();
    });

    test('should include the time when the next key will be available', async () => {
      const now = Date.now();

      // mark all keys as limited with different times
      apiKeyManager.markRateLimited('key1', 30); // 30 seconds
      apiKeyManager.markRateLimited('key2', 60); // 60 seconds
      apiKeyManager.markRateLimited('key3', 15); // 15 seconds - earliest

      try {
        await apiKeyManager.getKey();
        fail('Expected getKey to throw an error');
      } catch (error) {
        // error should include timestamp ~15 seconds in the future
        const expectedTime = new Date(now + 15000).toISOString().substring(0, 16); // compare just date and hour/minute
        expect((error as Error).message).toContain(expectedTime);
      }
    });
  });
});
