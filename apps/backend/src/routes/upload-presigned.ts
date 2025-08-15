import { FastifyPluginAsync } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

const uploadPresigned: FastifyPluginAsync = async (fastify) => {
  // Only initialize S3 if configured
  const s3Config = {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.R2_ENDPOINT || undefined,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
  };

  const bucketName = process.env.S3_BUCKET_NAME || process.env.R2_BUCKET_NAME;
  const isConfigured = bucketName && (s3Config.credentials || process.env.NODE_ENV === 'production');

  let s3Client: S3Client | null = null;
  if (isConfigured) {
    s3Client = new S3Client(s3Config);
  }

  // POST /upload/presigned - Get a presigned POST URL for voice upload
  fastify.post<{ Body: { contentType: string } }>('/presigned', {
    schema: {
      body: {
        type: 'object',
        properties: {
          contentType: { type: 'string', pattern: '^audio/' }
        },
        required: ['contentType']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uploadUrl: { type: 'string' },
            key: { type: 'string' },
            expiresIn: { type: 'number' }
          },
          required: ['uploadUrl', 'key', 'expiresIn']
        }
      }
    },
    preHandler: fastify.rateLimit({
      max: 10,
      timeWindow: '1 minute'
    })
  }, async (request, reply) => {
    const { contentType } = request.body;

    // Validate content type
    if (!contentType.startsWith('audio/')) {
      reply.code(400);
      return { error: 'invalid_content_type' };
    }

    // Check if S3/R2 is configured
    if (!s3Client || !bucketName) {
      // Fallback to local upload instructions
      reply.code(503);
      return { 
        error: 'upload_not_configured',
        message: 'Cloud storage not configured. Use /upload/voice endpoint for local uploads.'
      };
    }

    // Generate unique key
    const key = `voices/${new Date().toISOString().split('T')[0]}/${nanoid(12)}.webm`;
    const expiresIn = 300; // 5 minutes

    try {
      // Create presigned URL
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
        ContentLength: 750 * 1024, // Max 750KB
        Metadata: {
          'upload-type': 'voice-verification'
        }
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { 
        expiresIn,
        signableHeaders: new Set(['content-type', 'content-length'])
      });

      return {
        uploadUrl,
        key,
        expiresIn
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to generate presigned URL');
      reply.code(500);
      return { error: 'presigned_generation_failed' };
    }
  });

  // GET /upload/voice-url - Get the public URL for an uploaded voice file
  fastify.get<{ Querystring: { key: string } }>('/voice-url', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            url: { type: 'string' }
          },
          required: ['url']
        }
      }
    }
  }, async (request, reply) => {
    const { key } = request.query;

    if (!s3Client || !bucketName) {
      // For local uploads, return the local URL
      return {
        url: `${process.env.API_BASE_URL || 'http://localhost:3002'}/uploads/${key}`
      };
    }

    // For S3/R2, construct the public URL
    const publicDomain = process.env.S3_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN;
    if (publicDomain) {
      return {
        url: `${publicDomain}/${key}`
      };
    }

    // If no public domain configured, generate a temporary signed URL for retrieval
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key
      });
      
      const url = await getSignedUrl(s3Client, command, { 
        expiresIn: 3600 // 1 hour for playback
      });

      return { url };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to generate voice URL');
      reply.code(500);
      return { error: 'url_generation_failed' };
    }
  });
};

export default uploadPresigned;