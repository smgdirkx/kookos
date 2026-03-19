import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKey = process.env.S3_ACCESS_KEY;
const secretKey = process.env.S3_SECRET_KEY;

if (!endpoint || !bucket || !accessKey || !secretKey) {
  throw new Error(
    "Missing S3 environment variables (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)",
  );
}

export const s3 = new S3Client({
  endpoint,
  region: "us-east-1", // Required by SDK, ignored by SeaweedFS
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
  forcePathStyle: true, // Required for SeaweedFS (bucket in path, not subdomain)
});

export const S3_BUCKET = bucket;

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`Created S3 bucket: ${S3_BUCKET}`);
  }
}
