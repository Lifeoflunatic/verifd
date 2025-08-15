import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { VoiceUploadResponse } from '@verifd/shared';

const upload: FastifyPluginAsync = async (fastify) => {
  // Register multipart support with size limits
  await fastify.register(multipart, {
    limits: {
      fileSize: 750 * 1024, // 750KB max
      files: 1 // Only one file at a time
    }
  });

  // Ensure upload directory exists
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });

  // POST /upload/voice - Upload voice recording
  fastify.post('/voice', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'no_file' });
      }

      // Validate file type
      const allowedMimeTypes = [
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/mpeg',
        'audio/wav'
      ];

      if (!allowedMimeTypes.includes(data.mimetype)) {
        reply.code(400);
        return { error: 'invalid_file_type' };
      }

      // Generate unique filename
      const ext = data.filename?.split('.').pop() || 'webm';
      const filename = `voice-${nanoid(12)}-${Date.now()}.${ext}`;
      const filepath = path.join(uploadDir, filename);

      // Save file to disk
      await pipeline(data.file, await fs.open(filepath, 'w').then(h => h.createWriteStream()));

      // In production, you'd upload to S3/R2 here instead
      // For now, we'll serve from local storage
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
      const voiceUrl = `${baseUrl}/uploads/${filename}`;

      const response: VoiceUploadResponse = {
        voiceUrl
      };

      return response;
    } catch (error) {
      fastify.log.error({ error }, 'Voice upload failed');
      
      if ((error as any).code === 'FST_REQ_FILE_TOO_LARGE') {
        reply.code(413);
        return { error: 'file_too_large' };
      }
      
      reply.code(500);
      return { error: 'upload_failed' };
    }
  });

  // Serve uploaded files (in production, use CDN/S3)
  fastify.get<{ Params: { filename: string } }>('/uploads/:filename', async (request, reply) => {
    const { filename } = request.params;
    
    // Validate filename to prevent directory traversal
    if (!/^voice-[a-zA-Z0-9_-]+\.\w+$/.test(filename)) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const filepath = path.join(uploadDir, filename);
    
    try {
      const stat = await fs.stat(filepath);
      
      if (!stat.isFile()) {
        reply.code(404);
      return { error: 'not_found' };
      }

      // Set appropriate headers
      const ext = filename.split('.').pop();
      const mimeTypes: Record<string, string> = {
        webm: 'audio/webm',
        ogg: 'audio/ogg',
        mp4: 'audio/mp4',
        m4a: 'audio/mp4',
        mp3: 'audio/mpeg',
        wav: 'audio/wav'
      };

      reply.header('Content-Type', mimeTypes[ext!] || 'application/octet-stream');
      reply.header('Content-Length', stat.size);
      reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      const stream = await fs.open(filepath, 'r').then(h => h.createReadStream());
      return reply.send(stream);
    } catch (error) {
      reply.code(404);
      return { error: 'not_found' };
    }
  });
};

export default upload;