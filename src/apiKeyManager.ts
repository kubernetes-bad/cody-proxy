export default class ApiKeyManager {
  private static instance: ApiKeyManager | null = null;

  private readonly keys: string[] = [];
  private currentIndex: number = 0;
  private rateLimitedKeys: Map<string, number> = new Map(); // key to timestamp when it can be used again

  private constructor() {
    const envTokens: string = process.env.AUTH_TOKEN || '';
    if (!envTokens) {
      throw new Error('No token found. Please set your env var AUTH_TOKEN to your token value');
    }

    this.keys = envTokens.includes(',') ? envTokens.split(',') : [envTokens];
    if (!this.keys.length) throw new Error('At least one API key must be provided');
  }

  public static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) ApiKeyManager.instance = new ApiKeyManager();
    return ApiKeyManager.instance;
  }

  public async getKey(): Promise<string> {
    const key = await this.getNextKey();
    console.log(`USING KEY: ${key}`);
    return key;
  }

  private async getNextKey(): Promise<string> {
    const now = Date.now();

    const currentKey = this.keys[this.currentIndex];
    const currentKeyResumeTime = this.rateLimitedKeys.get(currentKey); // is rate limited?

    if (!currentKeyResumeTime || now >= currentKeyResumeTime) {
      if (currentKeyResumeTime) {
        console.log(`Key became available!`);
        this.rateLimitedKeys.delete(currentKey);
      }
      return currentKey; // is not rate limited
    }

    for (let i = 1; i < this.keys.length; i++) { // try other keys
      const keyIndex = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[keyIndex];
      const resumeTime = this.rateLimitedKeys.get(key);

      if (!resumeTime || now >= resumeTime) {
        if (resumeTime) {
          console.log(`Key became available!`);
          this.rateLimitedKeys.delete(key);
        }
        this.currentIndex = keyIndex; // make the key great again
        return key;
      }
    }

    // all keys rate limited. Get when next one will become available
    const nextKeyAvailableTs = Array.from(this.rateLimitedKeys.values())
      .reduce((earliestTime, resumeTime) =>
          (resumeTime < earliestTime) ? resumeTime : earliestTime, Number.MAX_SAFE_INTEGER);

    throw new Error(`No API keys available. All keys are rate limited. Next one will become available on ${new Date(nextKeyAvailableTs).toISOString()}.`);
  }

  public markRateLimited(key: string, retryAfter: number = 60): void {
    // special case: retryAfter = -1 means key is banned - do not retry
    if (retryAfter === -1) {
      console.warn(`Key "...${key.slice(-5)}" is banned! Excluding from rotation.`);
      retryAfter = Date.now(); // it's treated as number of SECONDS (it's actually ms) so it's gonna be in the year 57000+
    }
    const resumeTime = Date.now() + (retryAfter * 1000);
    this.rateLimitedKeys.set(key, resumeTime);
    console.warn(`API key marked as rate limited. Currently ${this.rateLimitedKeys.size} of ${this.keys.length} keys are rate limited.`);
  }
}
