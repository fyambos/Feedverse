
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CLOUDFLARE_S3 } from "./s3Client";
import { CLOUDFLARE } from "../constants";

export class R2Service {
  private requireConfigured() {
    if (!CLOUDFLARE.BUCKET) throw new Error("R2_BUCKET is not configured");
    if (!CLOUDFLARE.PUBLIC_URL) throw new Error("R2_PUBLIC_URL is not configured");
  }

  private inferExtension(file: Express.Multer.File): string {
    const raw = String(file.originalname ?? "");
    const ext = raw.includes(".") ? raw.split(".").pop() : "";
    const cleaned = String(ext ?? "").trim().toLowerCase();
    if (cleaned) return cleaned;

    const mt = String(file.mimetype ?? "").toLowerCase();
    if (mt === "image/jpeg" || mt === "image/jpg") return "jpg";
    if (mt === "image/png") return "png";
    if (mt === "image/webp") return "webp";
    return "jpg";
  }

  private async uploadToKey(file: Express.Multer.File, key: string): Promise<string> {
    this.requireConfigured();

    await CLOUDFLARE_S3.send(
      new PutObjectCommand({
        Bucket: CLOUDFLARE.BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `${CLOUDFLARE.PUBLIC_URL}/${key}`;
  }

  private keyFromPublicUrl(url: string): string | null {
    const raw = String(url ?? "").trim();
    if (!raw) return null;
    const base = String(CLOUDFLARE.PUBLIC_URL ?? "").trim().replace(/\/$/, "");
    if (!base) return null;
    if (!raw.startsWith(`${base}/`)) return null;
    const key = raw.slice(base.length + 1);
    return key ? decodeURIComponent(key) : null;
  }

  async deleteByPublicUrl(publicUrl: string): Promise<boolean> {
    this.requireConfigured();
    const key = this.keyFromPublicUrl(publicUrl);
    if (!key) return false;

    await CLOUDFLARE_S3.send(
      new DeleteObjectCommand({
        Bucket: CLOUDFLARE.BUCKET,
        Key: key,
      }),
    );

    return true;
  }

  async uploadAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    const date = Date.now();
    const fileExtension = this.inferExtension(file);
    const fileName = `${userId}_${date}.${fileExtension}`;
    const key = `${CLOUDFLARE.USER_DIR}/${fileName}`;

    return await this.uploadToKey(file, key);
  }

  async uploadProfileAvatar(file: Express.Multer.File, profileId: string): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const key = `profiles/avatars/${profileId}_${date}.${ext}`;
    return await this.uploadToKey(file, key);
  }

  async uploadProfileHeader(file: Express.Multer.File, profileId: string): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const key = `profiles/headers/${profileId}_${date}.${ext}`;
    return await this.uploadToKey(file, key);
  }

  async uploadPostImage(file: Express.Multer.File, postId: string, index: number): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const safeIdx = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    const key = `posts/images/${postId}_${date}_${safeIdx}.${ext}`;
    return await this.uploadToKey(file, key);
  }

  async uploadConversationAvatar(file: Express.Multer.File, conversationId: string): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const key = `conversations/avatars/${conversationId}_${date}.${ext}`;
    return await this.uploadToKey(file, key);
  }

  async uploadMessageImage(file: Express.Multer.File, messageId: string, index: number): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const safeIdx = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    const key = `messages/images/${messageId}_${date}_${safeIdx}.${ext}`;
    return await this.uploadToKey(file, key);
  }

    async uploadScenarioCover(file: Express.Multer.File, scenarioId: string): Promise<string> {
    const date = Date.now();
    const ext = this.inferExtension(file);
    const key = `scenarios/covers/${scenarioId}_${date}.${ext}`;
    return await this.uploadToKey(file, key);
  }
}

export const r2Service = new R2Service();
