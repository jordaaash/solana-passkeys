export function getRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function hexToBytes(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
    return bytes.reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '');
}
