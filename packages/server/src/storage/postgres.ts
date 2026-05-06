// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Binary } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import type { PresignedUrlOptions } from './base';
import { BaseBinaryStorage } from './base';
import { generatePresignedUrl } from './presign';
import type { BinarySource } from './types';
import { getLogger } from '../logger';
import { getDatabasePool } from '../database';

/**
 * PostgreSQL Binary Storage
 * Stores binary files directly in PostgreSQL database as bytea (binary) data.
 * 
 * Table structure:
 * CREATE TABLE IF NOT EXISTS binary_storage (
 *   key VARCHAR(255) PRIMARY KEY,
 *   content_type VARCHAR(255),
 *   data BYTEA NOT NULL,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 */
export class PostgresBinaryStorage extends BaseBinaryStorage {
  private readonly tableName = 'binary_storage';

  constructor() {
    super();
    this.ensureTableExists().catch((err) => {
      getLogger().error('Failed to create binary_storage table', err);
    });
  }

  /**
   * Ensures the binary_storage table exists in the database
   */
  private async ensureTableExists(): Promise<void> {
    const client = getDatabasePool();
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key VARCHAR(255) PRIMARY KEY,
        content_type VARCHAR(255),
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_binary_storage_created_at 
      ON ${this.tableName}(created_at);
    `;

    try {
      await client.query(createTableQuery);
      getLogger().info('Binary storage table ensured');
    } catch (err) {
      getLogger().error('Error creating binary_storage table', err);
      throw err;
    }
  }

  /**
   * Writes a binary file to PostgreSQL
   */
  async writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void> {
    const client = getDatabasePool();
    
    try {
      // Convert stream to buffer
      const buffer = await this.streamToBuffer(stream);
      
      // Insert or update the binary data
      const query = `
        INSERT INTO ${this.tableName} (key, content_type, data, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET 
          content_type = EXCLUDED.content_type,
          data = EXCLUDED.data,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await client.query(query, [key, contentType || 'application/octet-stream', buffer]);
      
      getLogger().info('Binary file written to PostgreSQL', { key, size: buffer.length });
    } catch (err) {
      getLogger().error('Error writing binary to PostgreSQL', { key, error: err });
      throw err;
    }
  }

  /**
   * Reads a binary file from PostgreSQL
   */
  async readFile(key: string): Promise<Readable> {
    const client = getDatabasePool();
    
    try {
      const query = `SELECT data FROM ${this.tableName} WHERE key = $1`;
      const result = await client.query(query, [key]);
      
      if (result.rows.length === 0) {
        throw new Error(`Binary not found: ${key}`);
      }
      
      const buffer = result.rows[0].data as Buffer;
      
      // Convert buffer to readable stream
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null); // Signal end of stream
      
      getLogger().info('Binary file read from PostgreSQL', { key, size: buffer.length });
      
      return readable;
    } catch (err) {
      getLogger().error('Error reading binary from PostgreSQL', { key, error: err });
      throw err;
    }
  }

  /**
   * Copies a binary file within PostgreSQL
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const client = getDatabasePool();
    
    try {
      const query = `
        INSERT INTO ${this.tableName} (key, content_type, data, created_at, updated_at)
        SELECT $2, content_type, data, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM ${this.tableName}
        WHERE key = $1
      `;
      
      const result = await client.query(query, [sourceKey, destinationKey]);
      
      if (result.rowCount === 0) {
        throw new Error(`Source binary not found: ${sourceKey}`);
      }
      
      getLogger().info('Binary file copied in PostgreSQL', { sourceKey, destinationKey });
    } catch (err) {
      getLogger().error('Error copying binary in PostgreSQL', { sourceKey, destinationKey, error: err });
      throw err;
    }
  }

  /**
   * Generates a presigned URL for accessing the binary
   * Note: For PostgreSQL storage, this still uses the Medplum storage endpoint
   */
  async getPresignedUrl(binary: Binary, opts?: PresignedUrlOptions): Promise<string> {
    return generatePresignedUrl(binary, opts);
  }

  /**
   * Converts a stream or string to a Buffer
   */
  private async streamToBuffer(stream: BinarySource): Promise<Buffer> {
    if (typeof stream === 'string') {
      return Buffer.from(stream);
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Utility method to get storage statistics
   */
  async getStorageStats(): Promise<{ count: number; totalSize: number }> {
    const client = getDatabasePool();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as count,
          SUM(LENGTH(data)) as total_size
        FROM ${this.tableName}
      `;
      
      const result = await client.query(query);
      
      return {
        count: parseInt(result.rows[0].count, 10),
        totalSize: parseInt(result.rows[0].total_size || '0', 10),
      };
    } catch (err) {
      getLogger().error('Error getting storage stats', err);
      throw err;
    }
  }

  /**
   * Utility method to delete old binaries (cleanup)
   */
  async deleteOldBinaries(daysOld: number): Promise<number> {
    const client = getDatabasePool();
    
    try {
      const query = `
        DELETE FROM ${this.tableName}
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      `;
      
      const result = await client.query(query);
      
      getLogger().info('Deleted old binaries', { count: result.rowCount, daysOld });
      
      return result.rowCount || 0;
    } catch (err) {
      getLogger().error('Error deleting old binaries', err);
      throw err;
    }
  }
}
