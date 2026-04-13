/**
 * User-friendly error messages — maps common error codes/patterns
 * to actionable messages. Never expose raw stack traces to users.
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /ENOENT|no such file/i, message: "Directory or file not found. Check that the project path exists." },
  { pattern: /EACCES|permission denied/i, message: "Permission denied. Check file/directory permissions." },
  { pattern: /ECONNREFUSED/i, message: "Service unavailable. Check that the server is running." },
  { pattern: /EADDRINUSE/i, message: "Port already in use. Another instance may be running." },
  { pattern: /ETIMEDOUT|timeout/i, message: "Operation timed out. Try again." },
  { pattern: /spawn.*ENOENT|not found in PATH/i, message: "Claude CLI not found. Make sure it is installed and in your PATH." },
  { pattern: /rate.?limit|429/i, message: "Rate limited. Please wait a moment and try again." },
  { pattern: /ENOMEM|out of memory/i, message: "System is out of memory. Close unused sessions." },
  { pattern: /invalid.*api.?key|unauthorized|401/i, message: "Invalid API key. Check your Anthropic API key configuration." },
  { pattern: /ENOSPC|no space/i, message: "Disk full. Free up space and try again." },
];

/** Convert any error into a safe, user-friendly message */
export function userFriendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }

  return "An unexpected error occurred. Check the server logs for details.";
}
