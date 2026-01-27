import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface ClaudeOptions {
  timeout?: number;  // ms, default 300000 (5 min)
  extractJson?: boolean;
}

/**
 * Execute Claude CLI safely using spawn to avoid shell injection
 */
function executeClaude(inputFile: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cat = spawn('cat', [inputFile]);
    const claude = spawn('claude', ['--print', '-']);

    let stdout = '';
    let stderr = '';

    // Set up timeout
    const timeoutId = setTimeout(() => {
      cat.kill();
      claude.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    // Pipe cat output to claude input
    cat.stdout.pipe(claude.stdin);

    // Collect claude output
    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle errors
    cat.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to read input file: ${error.message}`));
    });

    claude.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to execute claude: ${error.message}`));
    });

    // Handle completion
    claude.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });
  });
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

    const stdout = await executeClaude(tempFile, timeout);

    if (extractJson) {
      return extractJSON(stdout);
    }
    return stdout.trim();
  } finally {
    try { unlinkSync(tempFile); } catch (error) {
      console.warn('Failed to cleanup temp file:', tempFile, error);
    }
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
