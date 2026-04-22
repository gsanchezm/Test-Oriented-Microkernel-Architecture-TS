import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

/**
 * Streams the generated JSONL telemetry file to MinIO.
 * Required by AHM Mathematical Infrastructure Laws.
 */
export async function streamToMinio(filePath: string, runId: string): Promise<void> {
  const bucketName = 'ahm-markov-telemetry';
  
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`[AHM Telemetry] Created MinIO bucket: ${bucketName}`);
    }
    
    const objectName = `run-${runId}/telemetry.jsonl`;
    const metaData = {
      'Content-Type': 'application/x-ndjson',
    };
    
    await minioClient.fPutObject(bucketName, objectName, filePath, metaData);
    console.log(`[AHM Telemetry] Successfully uploaded ledger to MinIO: ${bucketName}/${objectName}`);
  } catch (error) {
    console.error(`[AHM Telemetry] Error streaming telemetry to MinIO:`, error);
  }
}
