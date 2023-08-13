import {createPrivateKey} from "@/app/turnkey";
import { createChallenge, verifyChallenge } from '../challenge';
import { parsers, server } from '@passwordless-id/webauthn';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Get a challenge for passkey registration.
 */
export async function GET(request: NextRequest) {
    const challenge = createChallenge('register');

    return NextResponse.json({ challenge });
}

/**
 * Verify passkey registration and create a Solana private key.
 */
export async function POST(request: NextRequest) {
    const json = await request.json();

    // Verify the challenge.
    const challengeBase64Encrypted = parsers.parseRegistration(json.registration).client.challenge;
    verifyChallenge('register', challengeBase64Encrypted);

    // Verify the webauthn registration against the challenge.
    const registration = await server.verifyRegistration(json.registration, {
        challenge: challengeBase64Encrypted,
        origin: request.nextUrl.origin,
    });

    // The registration is valid,
    const privateKey = await createPrivateKey(registration.credential.)

    return NextResponse.json({ res });
}
