/**
 * PromptScanner — Detect risky patterns in user prompts before forwarding to CLI.
 * Categorized detection with severity levels: info, warn, block.
 */

import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";

const log = createLogger("prompt-scanner");

export type RiskSeverity = "info" | "warn" | "block";

export interface ScanResult {
  safe: boolean;
  risks: RiskMatch[];
  maxSeverity: RiskSeverity | null;
}

export interface RiskMatch {
  category: string;
  pattern: string;
  severity: RiskSeverity;
  description: string;
  matched: string;
}

interface Rule {
  category: string;
  pattern: RegExp;
  severity: RiskSeverity;
  description: string;
}

// ─── Detection Rules ────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // Shell injection
  {
    category: "shell_injection",
    pattern: /\beval\s*\(/,
    severity: "warn",
    description: "eval() execution",
  },
  {
    category: "shell_injection",
    pattern: /`[^`]*`/,
    severity: "info",
    description: "Backtick command substitution",
  },
  {
    category: "shell_injection",
    pattern: /\$\([^)]+\)/,
    severity: "info",
    description: "Subshell execution $(...)",
  },
  {
    category: "shell_injection",
    pattern: /\b(curl|wget)\s+.*\|\s*(bash|sh|zsh)\b/,
    severity: "block",
    description: "Remote code execution via pipe",
  },
  {
    category: "shell_injection",
    pattern: /\b(curl|wget)\s+.*-[oO]\s/,
    severity: "warn",
    description: "Download to file",
  },

  // Path traversal
  {
    category: "path_traversal",
    pattern: /\.\.\/(\.\.\/){2,}/,
    severity: "warn",
    description: "Deep path traversal",
  },
  {
    category: "path_traversal",
    pattern: /\/etc\/(passwd|shadow|sudoers)\b/,
    severity: "block",
    description: "System file access",
  },
  {
    category: "path_traversal",
    pattern: /~\/\.(ssh|gnupg|aws)\b/,
    severity: "block",
    description: "Sensitive dotfile access",
  },

  // Privilege escalation
  {
    category: "privilege_escalation",
    pattern: /\bsudo\s+(rm|chmod|chown|dd|mkfs|kill)\b/,
    severity: "block",
    description: "Privileged destructive command",
  },
  {
    category: "privilege_escalation",
    pattern: /\bchmod\s+(777|a\+[rwx])\b/,
    severity: "warn",
    description: "Overly permissive chmod",
  },
  {
    category: "privilege_escalation",
    pattern: /\bchown\s+root\b/,
    severity: "warn",
    description: "Change ownership to root",
  },

  // Data exfiltration
  {
    category: "data_exfiltration",
    pattern: /\bprintenv\b/,
    severity: "info",
    description: "Environment variable dump",
  },
  {
    category: "data_exfiltration",
    pattern: /\bcat\s+.*\.(pem|key|crt|p12)\b/,
    severity: "block",
    description: "Certificate/key file read",
  },
  {
    category: "data_exfiltration",
    pattern: /\bcat\s+.*credentials\b/,
    severity: "block",
    description: "Credentials file read",
  },
  {
    category: "data_exfiltration",
    pattern: /\bcat\s+.*\.env\b/,
    severity: "warn",
    description: "Environment file read",
  },

  // Destructive commands
  {
    category: "destructive",
    pattern: /\brm\s+-[rf]{1,4}\s+\/(?:\s|$|&&|\|)/,
    severity: "block",
    description: "rm -rf / (root wipe)",
  },
  {
    category: "destructive",
    pattern: /\brm\s+-[rf]{1,4}\s+~\//,
    severity: "block",
    description: "rm -rf ~/ (home wipe)",
  },
  {
    category: "destructive",
    pattern: /\bmkfs\b/,
    severity: "block",
    description: "Filesystem format",
  },
  {
    category: "destructive",
    pattern: /\bdd\s+if=\/dev\/zero\b/,
    severity: "block",
    description: "Disk zeroing",
  },
  {
    category: "destructive",
    pattern: /:\(\)\{.*:\|:.*\}/,
    severity: "block",
    description: "Fork bomb",
  },
  {
    category: "destructive",
    pattern: /\b(drop|truncate)\s+(database|table)\b/i,
    severity: "block",
    description: "Database destructive operation",
  },

  // Encoded payloads
  {
    category: "encoded_payload",
    pattern: /\bbase64\s+(-d|--decode)\s*\|/,
    severity: "warn",
    description: "Base64 decode piped to execution",
  },
  {
    category: "encoded_payload",
    pattern: /\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){3,}/,
    severity: "warn",
    description: "Hex-encoded payload",
  },

  // Prompt injection
  {
    category: "prompt_injection",
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: "block",
    description: "Prompt injection attempt",
  },
  {
    category: "prompt_injection",
    pattern: /you\s+are\s+now\s+(a|an)\s+/i,
    severity: "warn",
    description: "Role override attempt",
  },
  {
    category: "prompt_injection",
    pattern: /\bsystem\s+prompt\b/i,
    severity: "info",
    description: "System prompt reference",
  },
  {
    category: "prompt_injection",
    pattern: /reveal\s+(your|the)\s+(instructions|prompt|system)/i,
    severity: "warn",
    description: "System prompt extraction attempt",
  },

  // Credential patterns
  {
    category: "credential_theft",
    pattern: /\b(sk|pk|api[_-]?key)[-_][a-zA-Z0-9]{20,}/,
    severity: "warn",
    description: "Possible API key in plaintext",
  },
  {
    category: "credential_theft",
    pattern: /\bghp_[a-zA-Z0-9]{36}\b/,
    severity: "block",
    description: "GitHub personal access token",
  },
  {
    category: "credential_theft",
    pattern: /\bAKIA[A-Z0-9]{16}\b/,
    severity: "block",
    description: "AWS access key",
  },

  // Network abuse
  {
    category: "network_abuse",
    pattern: /\bnc\s+(-[a-z]*\s+)*-l/,
    severity: "block",
    description: "Netcat listener (reverse shell)",
  },
  {
    category: "network_abuse",
    pattern: /\bbash\s+-i\s+>&\s*\/dev\/tcp\//,
    severity: "block",
    description: "Bash reverse shell",
  },
  {
    category: "network_abuse",
    pattern: /\/dev\/tcp\/\d/,
    severity: "block",
    description: "/dev/tcp connection",
  },

  // Package attacks
  {
    category: "package_attack",
    pattern: /\bnpm\s+install\s+.*https?:\/\/(?!registry\.npmjs)/,
    severity: "warn",
    description: "npm install from non-registry URL",
  },
  {
    category: "package_attack",
    pattern: /\bpip\s+install\s+.*--index-url\b/,
    severity: "warn",
    description: "pip install from custom index",
  },
];

// Severity ordering for comparison
const SEVERITY_ORDER: Record<RiskSeverity, number> = { info: 0, warn: 1, block: 2 };

/**
 * Scan a user prompt for risky patterns.
 */
export function scanPrompt(content: string): ScanResult {
  const risks: RiskMatch[] = [];

  for (const rule of RULES) {
    const match = rule.pattern.exec(content);
    if (match) {
      risks.push({
        category: rule.category,
        pattern: rule.pattern.source,
        severity: rule.severity,
        description: rule.description,
        matched: match[0].slice(0, 100),
      });
    }
  }

  const maxSeverity =
    risks.length > 0
      ? risks.reduce<RiskSeverity>(
          (max, r) => (SEVERITY_ORDER[r.severity] > SEVERITY_ORDER[max] ? r.severity : max),
          "info",
        )
      : null;

  if (risks.length > 0) {
    log.debug("Prompt scan result", {
      riskCount: risks.length,
      maxSeverity,
      categories: [...new Set(risks.map((r) => r.category))],
    });
  }

  return {
    safe: maxSeverity !== "block",
    risks,
    maxSeverity,
  };
}

// Cache scan-enabled setting (refreshed every 30s to avoid DB hit per message)
let _scanEnabledCache = true;
let _scanEnabledCacheTs = 0;
const CACHE_TTL_MS = 30_000;

/** Check if scanning is enabled (via settings, cached 30s) */
export function isScanEnabled(): boolean {
  const now = Date.now();
  if (now - _scanEnabledCacheTs < CACHE_TTL_MS) return _scanEnabledCache;
  try {
    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, "security.promptScan")).get();
    _scanEnabledCache = row?.value !== "false";
  } catch {
    _scanEnabledCache = true; // Default: enabled
  }
  _scanEnabledCacheTs = now;
  return _scanEnabledCache;
}
