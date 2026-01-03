import { PutObjectCommand } from "@aws-sdk/client-s3";
import { CLOUDFLARE_S3 } from "./s3Client";
import { v4 as uuidv4 } from "uuid";
import { CLOUDFLARE } from "../constants";

export class R2Service {
  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    const fileExtension = file.originalname.split(".").pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const key = `${CLOUDFLARE.USER_DIR}+${fileName}`;

    await CLOUDFLARE_S3.send(
      new PutObjectCommand({
        Bucket: CLOUDFLARE.BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = `https://your-r2-domain.com/${key}`;
    return publicUrl;
  }
}

export const r2Service = new R2Service();
