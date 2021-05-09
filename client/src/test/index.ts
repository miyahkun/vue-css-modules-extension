import { run as runCLI } from 'jest-cli';

export async function run(): Promise<void> {
  try {
    await runCLI(['--config', './jest.config.js']);
  } catch (err) {
    console.error('Tests failed', err);
  }
}
