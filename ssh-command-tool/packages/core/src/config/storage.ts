import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

export class SecureStorage {
  private key?: Buffer;
  private salt?: Buffer;

  async init(password: string, existingSalt?: Buffer): Promise<void> {
    this.salt = existingSalt || randomBytes(SALT_LENGTH);
    this.key = (await scryptAsync(password, this.salt, KEY_LENGTH)) as Buffer;
  }

  getSalt(): Buffer | undefined {
    return this.salt;
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new Error('SecureStorage not initialized');
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.key) {
      throw new Error('SecureStorage not initialized');
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  isInitialized(): boolean {
    return !!this.key;
  }

  clear(): void {
    if (this.key) {
      this.key.fill(0);
      this.key = undefined;
    }
    this.salt = undefined;
  }
}

export function isEncryptedValue(value: string): boolean {
  // Check if the value matches our encryption format (iv:authTag:encrypted)
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Each part should be valid hex
  return parts.every((part) => /^[0-9a-f]+$/i.test(part));
}
