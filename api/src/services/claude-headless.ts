import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

interface ClaudeOptions {
  timeout?: number;  // ms, default 300000 (5 min)
  extractJson?: boolean;
}

/**
 * Call Claude CLI in headless mode with the given prompt.
 * Uses temp file approach to avoid shell escaping issues.
 *
 * @param prompt - The prompt to send to Claude
 * @param options - Configuration options
 * @returns The response from Claude (optionally JSON-extracted)
 */
export async function callClaude(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const { timeout = 300000, extractJson = false } = options;

  const tempFile = join(tmpdir(), `claude-wiki-${Date.now()}.txt`);

  try {
    writeFileSync(tempFile, prompt);

    const { stdout } = await execAsync(
      `cat "${tempFile}" | claude --print -`,
      { timeout, maxBuffer: 10 * 1024 * 1024 }
    );

    if (extractJson) {
      return extractJSON(stdout);
    }
    return stdout.trim();
  } finally {
    try { unlinkSync(tempFile); } catch {}
  }
}

/**
 * Extract JSON from a Claude response.
 * Handles markdown code blocks and raw JSON.
 */
function extractJSON(response: string): string {
  // Try markdown code blocks first
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try raw JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return response;
}
