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
    const res = await CLOUDFLARE_S3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        MaxKeys: 5,
      }),
    );
    console.log("✅ OK - bucket accessible");
    console.log(
      "objects:",
      (res.Contents ?? []).map((o) => o.Key),
    );
  } catch (e) {
    console.error("❌ FAIL");
    console.error(e);
    process.exit(1);
  }
};
// console.log(CLOUDFLARE_S3.send(new ListBucketsCommand({})));
// {
//     '$metadata': {
//     httpStatusCode: 200,
//         requestId: undefined,
//         extendedRequestId: undefined,
//         cfId: undefined,
//         attempts: 1,
//         totalRetryDelay: 0
// },
//     Buckets: [
//     { Name: 'user-uploads', CreationDate: 2022-04-13T21:23:47.102Z },
//     { Name: 'my-bucket', CreationDate: 2022-05-07T02:46:49.218Z }
//     ],
//     Owner: {
//         DisplayName: '...',
//         ID: '...'
//     }
// }

// console.log(await CLOUDFLARE_S3.send(new ListObjectsV2Command({ Bucket: "my-bucket" })));
// {
//     '$metadata': {
//       httpStatusCode: 200,
//       requestId: undefined,
//       extendedRequestId: undefined,
//       cfId: undefined,
//       attempts: 1,
//       totalRetryDelay: 0
//     },
//     CommonPrefixes: undefined,
//     Contents: [
//       {
//         Key: 'cat.png',
//         LastModified: 2022-05-07T02:50:45.616Z,
//         ETag: '"c4da329b38467509049e615c11b0c48a"',
//         ChecksumAlgorithm: undefined,
//         Size: 751832,
//         StorageClass: 'STANDARD',
//         Owner: undefined
//       },
//       {
//         Key: 'todos.txt',
//         LastModified: 2022-05-07T21:37:17.150Z,
//         ETag: '"29d911f495d1ba7cb3a4d7d15e63236a"',
//         ChecksumAlgorithm: undefined,
//         Size: 279,
//         StorageClass: 'STANDARD',
//         Owner: undefined
//       }
//     ],
//     ContinuationToken: undefined,
//     Delimiter: undefined,
//     EncodingType: undefined,
//     IsTruncated: false,
//     KeyCount: 8,
//     MaxKeys: 1000,
//     Name: 'my-bucket',
//     NextContinuationToken: undefined,
//     Prefix: undefined,
//     StartAfter: undefined
//   }
