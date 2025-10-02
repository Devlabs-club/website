import dotenv from 'dotenv';

dotenv.config();

class CloudflareEmbeddings {
  private accountId: string;
  private apiToken: string;
  private model: string;
  private endpoint: string;

  constructor(options: { accountId?: string; apiToken?: string; model?: string } = {}) {
    this.accountId = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
    this.apiToken = options.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';
    this.model = options.model || process.env.CLOUDFLARE_EMBEDDING_MODEL || '@cf/baai/bge-small-en-v1.5';

    if (!this.accountId || !this.apiToken || !this.model) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_EMBEDDING_MODEL environment variables are required');
    }

    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error('embedDocuments expects an array of strings');
    }
    if (texts.length === 0) return [];

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: texts }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare AI API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    if (!data.result || !data.result.data) {
      throw new Error('Invalid response format from Cloudflare AI API');
    }
    return data.result.data as number[][];
  }

  async embedQuery(text: string): Promise<number[]> {
    if (typeof text !== 'string') throw new Error('embedQuery expects a string');

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare AI API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    if (!data.result || !data.result.data || !data.result.data[0]) {
      throw new Error('Invalid response format from Cloudflare AI API');
    }
    return data.result.data[0] as number[];
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    return 384;
  }
}

export default CloudflareEmbeddings;


