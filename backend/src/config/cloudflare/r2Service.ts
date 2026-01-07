import { PutObjectCommand } from "@aws-sdk/client-s3";
import { CLOUDFLARE_S3 } from "./s3Client";
import { CLOUDFLARE } from "../constants";

export class R2Service {
  async uploadAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    const date = Date.now();
    const fileExtension = file.originalname.split(".").pop();
    const fileName = `${userId}_${date}.${fileExtension}`;
    const key = `${CLOUDFLARE.USER_DIR}/${fileName}`;

    await CLOUDFLARE_S3.send(
      new PutObjectCommand({
        Bucket: CLOUDFLARE.BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = `${CLOUDFLARE.PUBLIC_URL}/${key}`;
    return publicUrl;
  }

  async uploadScenarioCover(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    const date = Date.now();
    const fileExtension = file.originalname.split(".").pop();
    const fileName = `${userId}_${date}.${fileExtension}`;
    const key = `${CLOUDFLARE.SCENARIO_DIR}/${CLOUDFLARE.COVER_DIR}/${fileName}`;

    await CLOUDFLARE_S3.send(
      new PutObjectCommand({
        Bucket: CLOUDFLARE.BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = `${CLOUDFLARE.PUBLIC_URL}/${key}`;
    return publicUrl;
  }
}

export const r2Service = new R2Service();
