import type { PostApi } from "../posts/postModels";
import type { MessageApi } from "../messages/messageModels";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function kvRow(label: string, value: string) {
  return `<tr><th style="text-align:left; padding:8px 10px; border:1px solid #e5e7eb; background:#f9fafb; width: 220px;">${escapeHtml(label)}</th><td style="padding:8px 10px; border:1px solid #e5e7eb; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${escapeHtml(value || "-")}</td></tr>`;
}

function sectionTitle(title: string) {
  return `<h3 style="margin:18px 0 8px; font-size: 14px; color: #111827;">${escapeHtml(title)}</h3>`;
}

export function buildReportEmail(args: {
  kind: "post" | "message";
  subjectId: string;
  summary: {
    reporterUserId: string;
    reporterUsername?: string | null;
    reporterEmail?: string | null;

    scenarioId?: string | null;
    conversationId?: string | null;
    conversationTitle?: string | null;

    createdAt?: string | null;
    editedAt?: string | null;

    createdByUserId?: string | null;
    createdByUsername?: string | null;
    createdByEmail?: string | null;
    createdByProfileId?: string | null;
    createdByProfileHandle?: string | null;
    createdByProfileDisplayName?: string | null;

    editedByUserId?: string | null;
    editedByUsername?: string | null;
    editedByEmail?: string | null;
    editedByProfileId?: string | null;
    editedByProfileHandle?: string | null;
    editedByProfileDisplayName?: string | null;

    reportMessage?: string | null;
  };
  content: {
    post?: Pick<PostApi, "id" | "text" | "imageUrls" | "createdAt" | "updatedAt" | "postType" | "scenarioId">;
    message?: Pick<MessageApi, "id" | "text" | "imageUrls" | "createdAt" | "updatedAt" | "editedAt" | "kind" | "scenarioId" | "conversationId" | "senderProfileId" | "senderUserId">;
  };
}) {
  const { kind, subjectId, summary } = args;

  const reporterLine = `${summary.reporterUserId}${summary.reporterUsername ? ` (@${summary.reporterUsername})` : ""}${summary.reporterEmail ? ` <${summary.reporterEmail}>` : ""}`;
  const createdByLine = `${summary.createdByUserId ?? "-"}${summary.createdByUsername ? ` (@${summary.createdByUsername})` : ""}${summary.createdByEmail ? ` <${summary.createdByEmail}>` : ""}`;
  const createdProfileLine = `${summary.createdByProfileId ?? "-"}${summary.createdByProfileHandle ? ` (@${summary.createdByProfileHandle})` : ""}${summary.createdByProfileDisplayName ? ` — ${summary.createdByProfileDisplayName}` : ""}`;

  const editedByLine = `${summary.editedByUserId ?? "-"}${summary.editedByUsername ? ` (@${summary.editedByUsername})` : ""}${summary.editedByEmail ? ` <${summary.editedByEmail}>` : ""}`;
  const editedProfileLine = `${summary.editedByProfileId ?? "-"}${summary.editedByProfileHandle ? ` (@${summary.editedByProfileHandle})` : ""}${summary.editedByProfileDisplayName ? ` — ${summary.editedByProfileDisplayName}` : ""}`;

  const header = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4; color: #111827;">
    <h2 style="margin: 0 0 10px; font-size: 18px;">Feedverse report: ${escapeHtml(kind)} ${escapeHtml(subjectId)}</h2>
    <p style="margin: 0 0 14px; color: #374151; font-size: 13px;">A user reported content. Summary below; full snapshot is attached as <b>snapshot.json</b>.</p>
  `;

  const summaryTable = `
    ${sectionTitle("Summary")}
    <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 900px; font-size: 12px;">
      ${kvRow("Reporter", reporterLine)}
      ${kvRow("Scenario ID", String(summary.scenarioId ?? "-"))}
      ${kind === "message" ? kvRow("Conversation", `${String(summary.conversationId ?? "-")}${summary.conversationTitle ? ` — ${summary.conversationTitle}` : ""}`) : ""}
      ${kvRow("Created at", String(summary.createdAt ?? "-"))}
      ${kvRow("Edited at", String(summary.editedAt ?? "-"))}
      ${kvRow("Created by (user)", createdByLine)}
      ${kvRow("Created by (profile)", createdProfileLine)}
      ${kvRow("Last edited by (user)", editedByLine)}
      ${kvRow("Last edited by (profile)", editedProfileLine)}
    </table>
  `;

  const reportMsg = (summary.reportMessage ?? "").trim();
  const reportBlock = reportMsg
    ? `
      ${sectionTitle("Reporter note")}
      <pre style="white-space: pre-wrap; background: #0b1020; color: #e5e7eb; padding: 12px; border-radius: 10px; font-size: 12px; max-width: 900px;">${escapeHtml(reportMsg)}</pre>
    `
    : "";

  const contentText =
    kind === "post"
      ? String(args.content.post?.text ?? "")
      : String(args.content.message?.text ?? "");

  const contentLabel = kind === "post" ? "Post content" : "Message content";

  const contentBlock = `
    ${sectionTitle(contentLabel)}
    <pre style="white-space: pre-wrap; background: #111827; color: #f9fafb; padding: 12px; border-radius: 10px; font-size: 12px; max-width: 900px;">${escapeHtml(contentText || "(no text)")}</pre>
  `;

  const footer = `</div>`;

  const html = `${header}${summaryTable}${reportBlock}${contentBlock}${footer}`;

  const text =
    `Feedverse report (${kind})\n` +
    `ID: ${subjectId}\n` +
    `Reporter: ${reporterLine}\n` +
    `Scenario: ${summary.scenarioId ?? "-"}\n` +
    (kind === "message" ? `Conversation: ${summary.conversationId ?? "-"}${summary.conversationTitle ? ` — ${summary.conversationTitle}` : ""}\n` : "") +
    `Created at: ${summary.createdAt ?? "-"}\n` +
    `Edited at: ${summary.editedAt ?? "-"}\n` +
    `Created by user: ${createdByLine}\n` +
    `Created by profile: ${createdProfileLine}\n` +
    `Last edited by user: ${editedByLine}\n` +
    `Last edited by profile: ${editedProfileLine}\n\n` +
    (reportMsg ? `Reporter note:\n${reportMsg}\n\n` : "") +
    `${contentLabel}:\n${contentText || "(no text)"}\n\n` +
    `Full snapshot is attached as snapshot.json\n`;

  return { html, text };
}
