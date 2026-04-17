/**
 * Telegram /account command — list, switch, rename, usage for multi-account management.
 */

import type { TelegramBridge } from "../telegram-bridge.js";
import { escapeHTML } from "../formatter.js";
import { listAccounts, switchAccount, renameAccount } from "../../services/credential-manager.js";
import { isEncryptionEnabled } from "../../services/crypto.js";

const STATUS_EMOJI: Record<string, string> = {
  ready: "\u{1F7E2}",
  rate_limited: "\u{1F7E1}",
  expired: "\u{1F534}",
  error: "\u{1F534}",
};

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatCooldown(until: Date | null): string {
  if (!until) return "";
  const remainMs = new Date(until).getTime() - Date.now();
  if (remainMs <= 0) return "";
  const mins = Math.ceil(remainMs / 60_000);
  return ` (${mins}m left)`;
}

export function registerAccountCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  bot.command("account", async (ctx) => {
    if (!isEncryptionEnabled()) {
      await ctx.reply("Multi-account disabled \u2014 COMPANION_ENCRYPTION_KEY not set.");
      return;
    }

    const args = ctx.match?.trim().split(/\s+/) ?? [];
    const subcommand = args[0]?.toLowerCase();

    // ── /account (list) ──────────────────────────────────────────────

    if (!subcommand || subcommand === "list") {
      const accs = listAccounts();
      if (accs.length === 0) {
        await ctx.reply(
          "No accounts saved. Run <code>/login</code> in Claude Code to auto-capture.",
          { parse_mode: "HTML" },
        );
        return;
      }

      const lines = accs.map((a, i) => {
        const status = STATUS_EMOJI[a.status] ?? "\u26AA";
        const active = a.isActive ? " (active)" : "";
        const cooldown = a.status === "rate_limited" ? formatCooldown(a.statusUntil) : "";
        const cost = formatCost(a.totalCostUsd);
        return `${i + 1}. ${status} <b>${escapeHTML(a.label)}</b>${active} \u2014 ${cost}${cooldown}`;
      });

      await ctx.reply(`<b>Accounts:</b>\n${lines.join("\n")}`, { parse_mode: "HTML" });
      return;
    }

    // ── /account switch <label|#> ────────────────────────────────────

    if (subcommand === "switch") {
      const target = args.slice(1).join(" ");
      if (!target) {
        await ctx.reply("Usage: /account switch &lt;label or #number&gt;", { parse_mode: "HTML" });
        return;
      }

      const accs = listAccounts();
      let account;

      const num = parseInt(target, 10);
      if (!isNaN(num) && num >= 1 && num <= accs.length) {
        account = accs[num - 1];
      }
      if (!account) {
        // Exact match first, then prefix match — avoid ambiguous substring
        account =
          accs.find((a) => a.label.toLowerCase() === target.toLowerCase()) ??
          accs.find((a) => a.label.toLowerCase().startsWith(target.toLowerCase()));
      }
      if (!account) {
        await ctx.reply(`Account not found: <code>${escapeHTML(target)}</code>`, {
          parse_mode: "HTML",
        });
        return;
      }
      if (account.isActive) {
        await ctx.reply(`Already using <b>${escapeHTML(account.label)}</b>`, {
          parse_mode: "HTML",
        });
        return;
      }

      const ok = await switchAccount(account.id);
      if (ok) {
        await ctx.reply(
          `Switched to <b>${escapeHTML(account.label)}</b>. Next session will use this account.`,
          { parse_mode: "HTML" },
        );
      } else {
        await ctx.reply("Failed to switch account.");
      }
      return;
    }

    // ── /account rename <#> <name> ───────────────────────────────────

    if (subcommand === "rename") {
      const targetId = args[1];
      const newLabel = args.slice(2).join(" ");
      if (!targetId || !newLabel) {
        await ctx.reply("Usage: /account rename &lt;#number&gt; &lt;new name&gt;", {
          parse_mode: "HTML",
        });
        return;
      }

      const accs = listAccounts();
      const num = parseInt(targetId, 10);
      const account = !isNaN(num) && num >= 1 && num <= accs.length ? accs[num - 1] : undefined;
      if (!account) {
        await ctx.reply("Account not found.");
        return;
      }

      const ok = renameAccount(account.id, newLabel);
      if (ok) {
        await ctx.reply(`Renamed to <b>${escapeHTML(newLabel)}</b>`, { parse_mode: "HTML" });
      } else {
        await ctx.reply("Failed to rename.");
      }
      return;
    }

    // ── /account usage ───────────────────────────────────────────────

    if (subcommand === "usage") {
      const accs = listAccounts();
      if (accs.length === 0) {
        await ctx.reply("No accounts.");
        return;
      }

      const lines = accs.map((a) => {
        const status = STATUS_EMOJI[a.status] ?? "\u26AA";
        return `${status} <b>${escapeHTML(a.label)}</b>: ${formatCost(a.totalCostUsd)}`;
      });
      const total = accs.reduce((sum, a) => sum + a.totalCostUsd, 0);

      await ctx.reply(
        `<b>Usage Summary:</b>\n${lines.join("\n")}\n\n<b>Total:</b> ${formatCost(total)}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // ── Help ─────────────────────────────────────────────────────────

    await ctx.reply(
      "Usage:\n/account \u2014 list accounts\n/account switch &lt;label|#&gt; \u2014 switch active\n/account rename &lt;#&gt; &lt;name&gt; \u2014 rename\n/account usage \u2014 cost summary",
      { parse_mode: "HTML" },
    );
  });
}
