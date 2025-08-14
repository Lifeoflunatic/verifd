/**
 * JWKS (JSON Web Key Set) endpoint for key rotation
 * Provides public keys for JWT token verification
 */

import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

export default async function jwksRoutes(fastify: FastifyInstance) {
  // JWKS endpoint
  fastify.get('/.well-known/jwks.json', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            keys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kty: { type: 'string' },
                  crv: { type: 'string' },
                  use: { type: 'string' },
                  kid: { type: 'string' },
                  alg: { type: 'string' },
                  x: { type: 'string' },
                  n: { type: 'string' },
                  e: { type: 'string' }
                }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    try {
      const jwks = await generateJWKS();
      
      return reply
        .header('Cache-Control', 'public, max-age=3600') // Cache for 1 hour
        .header('Content-Type', 'application/json')
        .send(jwks);
    } catch (error) {
      fastify.log.error('Failed to generate JWKS:', error);
      return reply.status(500).send({ 
        error: 'jwks_generation_failed',
        message: 'Unable to generate JWKS response'
      });
    }
  });

  // Key rotation status endpoint (admin only)
  fastify.get<{
    Headers: {
      'x-admin-token'?: string;
    }
  }>('/admin/keys/status', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-admin-token': { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            keyPath: { type: 'string' },
            lastModified: { type: 'string' },
            ageInDays: { type: 'number' },
            rotationRecommended: { type: 'boolean' },
            jwksEndpoint: { type: 'string' },
            error: { type: 'string' },
            keyExists: { type: 'boolean' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    const adminToken = request.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_SIGNING_KEY) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    try {
      const status = await getKeyRotationStatus();
      return reply.send(status);
    } catch (error) {
      fastify.log.error('Failed to get key status:', error);
      return reply.status(500).send({ 
        error: 'key_status_failed',
        message: 'Unable to retrieve key status'
      });
    }
  });

  // Trigger key rotation (admin only)
  fastify.post<{
    Headers: {
      'x-admin-token'?: string;
    };
    Body: {
      reason?: string;
    }
  }>('/admin/keys/rotate', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-admin-token': { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            oldKeyId: { type: 'string' },
            newKeyId: { type: 'string' },
            rotatedAt: { type: 'string' },
            reason: { type: 'string' },
            status: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    const adminToken = request.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_SIGNING_KEY) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    try {
      const { reason } = request.body;
      const result = await rotateSigningKeys(reason || 'Manual rotation');
      
      return reply.send({
        success: true,
        ...result
      });
    } catch (error) {
      fastify.log.error('Key rotation failed:', error);
      return reply.status(500).send({ 
        error: 'key_rotation_failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

/**
 * Generate JWKS response from current signing keys
 */
async function generateJWKS() {
  const keyId = process.env.SIGNING_KEY_ID || `verifd-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  
  // Try to load from staging keys first, then fallback to default paths
  let signingKeyPath = process.env.SIGNING_KEY_PATH;
  
  if (!signingKeyPath) {
    // Check if we're in staging environment
    if (process.env.NODE_ENV === 'staging') {
      signingKeyPath = join(process.cwd(), 'keys/staging/signing.key');
    } else {
      signingKeyPath = join(process.cwd(), 'keys/signing.key');
    }
  }
  
  try {
    const publicKeyPem = extractPublicKey(signingKeyPath);
    const jwk = convertToJWK(publicKeyPem, keyId);
    
    return {
      keys: [jwk]
    };
  } catch (error) {
    // Fallback: generate a mock JWK for development
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
      console.warn('Using mock JWK for development/staging');
      return generateMockJWKS(keyId);
    }
    throw error;
  }
}

/**
 * Extract public key from private key file
 */
function extractPublicKey(privateKeyPath: string): string {
  try {
    const privateKeyPem = readFileSync(privateKeyPath, 'utf8');
    
    // Use Node.js crypto to extract public key
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKey = crypto.createPublicKey(privateKey);
    
    return publicKey.export({
      type: 'spki',
      format: 'pem'
    }) as string;
  } catch (error) {
    throw new Error(`Failed to extract public key from ${privateKeyPath}: ${error}`);
  }
}

/**
 * Convert PEM public key to JWK format
 */
function convertToJWK(publicKeyPem: string, keyId: string) {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    
    // For Ed25519 keys
    if (publicKey.asymmetricKeyType === 'ed25519') {
      const keyData = publicKey.export({ format: 'der', type: 'spki' });
      
      // Ed25519 public key is the last 32 bytes of the DER encoding
      const ed25519Key = keyData.subarray(-32);
      const x = ed25519Key.toString('base64url');
      
      return {
        kty: 'OKP',
        crv: 'Ed25519',
        use: 'sig',
        kid: keyId,
        alg: 'EdDSA',
        x: x
      };
    }
    
    // For RSA keys (fallback)
    if (publicKey.asymmetricKeyType === 'rsa') {
      const keyDetails = publicKey.asymmetricKeyDetails;
      if (!keyDetails) throw new Error('Unable to get RSA key details');
      
      return {
        kty: 'RSA',
        use: 'sig',
        kid: keyId,
        alg: 'RS256',
        n: (keyDetails as any).modulus?.toString('base64url'),
        e: (keyDetails as any).exponent?.toString('base64url')
      };
    }
    
    throw new Error(`Unsupported key type: ${publicKey.asymmetricKeyType}`);
  } catch (error) {
    throw new Error(`Failed to convert to JWK: ${error}`);
  }
}

/**
 * Generate mock JWKS for development/staging
 */
function generateMockJWKS(keyId: string) {
  return {
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        use: 'sig',
        kid: keyId,
        alg: 'EdDSA',
        x: 'mock-public-key-for-development-only'
      }
    ]
  };
}

/**
 * Get key rotation status
 */
async function getKeyRotationStatus() {
  const keyId = process.env.SIGNING_KEY_ID || 'unknown';
  const signingKeyPath = process.env.SIGNING_KEY_PATH || './keys/signing.key';
  
  try {
    const stats = await import('fs/promises').then(fs => fs.stat(signingKeyPath));
    const ageInDays = Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      keyId,
      keyPath: signingKeyPath,
      lastModified: stats.mtime.toISOString(),
      ageInDays,
      rotationRecommended: ageInDays > 30,
      jwksEndpoint: process.env.JWKS_ENDPOINT_URL || '/.well-known/jwks.json'
    };
  } catch (error) {
    return {
      keyId,
      keyPath: signingKeyPath,
      error: error instanceof Error ? error.message : 'Unknown error',
      keyExists: false
    };
  }
}

/**
 * Rotate signing keys (implementation placeholder)
 */
async function rotateSigningKeys(reason: string) {
  const timestamp = new Date().toISOString();
  const newKeyId = `verifd-${timestamp.slice(0, 10).replace(/-/g, '')}`;
  
  // In production, this would:
  // 1. Generate new Ed25519 key pair
  // 2. Back up old keys
  // 3. Update key configuration
  // 4. Restart services with new keys
  // 5. Update JWKS endpoint
  
  console.log(`[Key Rotation] Initiated rotation: ${reason}`);
  console.log(`[Key Rotation] New Key ID: ${newKeyId}`);
  
  // For staging/development, just simulate the process
  if (process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'development') {
    return {
      oldKeyId: process.env.SIGNING_KEY_ID || 'unknown',
      newKeyId,
      rotatedAt: timestamp,
      reason,
      status: 'simulated'
    };
  }
  
  // Production implementation would go here
  throw new Error('Production key rotation not implemented');
}