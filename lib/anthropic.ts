import Anthropic from '@anthropic-ai/sdk';

// Zhipu AI Claude-compatible mode:
//   Set ZHIPU_API_KEY in .env.local → uses https://open.bigmodel.cn/api/anthropic + glm-4.7
// Anthropic native mode:
//   Set ANTHROPIC_API_KEY in .env.local → uses Anthropic API + claude-sonnet-4-6

const isZhipu = !!process.env.ZHIPU_API_KEY;

export const MODEL = isZhipu ? (process.env.ZHIPU_MODEL ?? 'glm-4.7') : 'claude-sonnet-4-6';

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    if (isZhipu) {
      _client = new Anthropic({
        apiKey: process.env.ZHIPU_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
      });
    } else {
      _client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }
  return _client;
}
