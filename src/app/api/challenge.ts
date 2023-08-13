import { decrypt, encrypt } from '@noble/ciphers/simple';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils';

const ENCRYPTION_PRIVATE_KEY = new Uint8Array(Buffer.from(process.env.ENCRYPTION_PRIVATE_KEY!, 'hex'));
const CHALLENGE_TIMEOUT = 60 * 1000; // 60 seconds

/**
 * Encrypt a challenge with a nonce and MAC, so it can't be forged by the client.
 */
export function createChallenge(type: string): string {
    const challenge = { type, timestamp: Date.now() };
    const challengeBytes = utf8ToBytes(JSON.stringify(challenge));
    const challengeEncrypted = encrypt(ENCRYPTION_PRIVATE_KEY, challengeBytes);
    const challengeEncryptedBase64 = Buffer.from(challengeEncrypted).toString('base64');
    return challengeEncryptedBase64;
}

/**
 * Decrypt a challenge and check its type and timestamp.
 */
export function verifyChallenge(type: string, challengeEncryptedBase64: string) {
    const challengeEncrypted = new Uint8Array(Buffer.from(challengeEncryptedBase64, 'base64'));
    const challengeBytes = decrypt(ENCRYPTION_PRIVATE_KEY, challengeEncrypted);
    const challenge = JSON.parse(bytesToUtf8(challengeBytes));
    if (challenge.type !== 'register') throw new Error('challenge type invalid');
    if (typeof challenge.timestamp !== 'number') throw new Error('challenge timestamp invalid');
    if (Date.now() > challenge.timestamp + CHALLENGE_TIMEOUT) throw new Error('challenge timeout');
}
