import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { CLOUDFLARE } from "../constants";

export const CLOUDFLARE_S3 = new S3Client({
  region: "auto",
  endpoint: `https://${CLOUDFLARE.ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE.ACCESS_KEY,
    secretAccessKey: CLOUDFLARE.SECRET,
  },
});

export const CLOUDFLARE_TEST = async () => {
  try {
    if (!CLOUDFLARE.PUBLIC_URL) {
      console.warn("⚠️ R2_PUBLIC_URL non définie");
    }

    const res = await CLOUDFLARE_S3.send(
      new ListObjectsV2Command({
        Bucket: CLOUDFLARE.PUBLIC_URL,
        MaxKeys: 5,
      }),
    );
    console.log("✅ Bucket");
    console.log(
      "objects:",
      (res.Contents ?? []).map((o) => o.Key),
    );
  } catch (e) {
    console.error("❌ Erreur");
    console.error(e);
    process.exit(1);
  }
};
