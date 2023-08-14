import { sha256 } from '@noble/hashes/sha256';
import { getWebAuthnAttestation, SignedRequest, TurnkeyActivityError, TurnkeyApi } from '@turnkey/http';
import { bytesToBase64Url, bytesToHex, getRandomBytes, hexToBytes } from './bytes';

export type Registration = { subOrganizationId: string; privateKeyId: string; publicKey: string };

export async function register(): Promise<Registration> {
    const challenge = getRandomBytes(32);
    const rp = window.location.hostname;
    const username = 'Solana Passkey';

    const attestation = await getWebAuthnAttestation({
        publicKey: {
            challenge,
            rp: {
                id: rp,
                name: rp,
            },
            user: {
                id: sha256(new TextEncoder().encode(username)), // FIXME: 741d7569b69dfc664fe4d7eb5167bc7c4e9b70bd93a53ab808e6c0d6811c87de
                name: username,
                displayName: username,
            },
            timeout: 60000,
            authenticatorSelection: {
                userVerification: 'required',
                authenticatorAttachment: undefined,
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            attestation: 'direct',
        },
    });

    const response = await fetch('/api/turnkey/register', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            challenge: bytesToBase64Url(challenge),
            attestation,
        }),
    });

    return await response.json();
}

export type Signature = { signature: Uint8Array };

export async function signBytes({
    bytes,
    subOrganizationId,
    privateKeyId,
}: {
    bytes: Uint8Array;
    subOrganizationId: string;
    privateKeyId: string;
}): Promise<Signature> {
    const signedRequest = await TurnkeyApi.signSignRawPayload({
        body: {
            type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD',
            organizationId: subOrganizationId,
            timestampMs: Date.now().toString(),
            parameters: {
                privateKeyId,
                payload: bytesToHex(bytes),
                encoding: 'PAYLOAD_ENCODING_HEXADECIMAL',
                hashFunction: 'HASH_FUNCTION_NOT_APPLICABLE',
            },
        },
    });
    const { activity }: Awaited<ReturnType<(typeof TurnkeyApi)['signRawPayload']>> = await proxy(signedRequest);

    const result = activity.result.signRawPayloadResult;
    if (!result)
        throw new TurnkeyActivityError({
            message: 'missing SIGN_RAW_PAYLOAD result',
            cause: null,
            activityId: activity.id,
            activityStatus: activity.status,
            activityType: activity.type,
        });

    const signature = hexToBytes(`${result.r}${result.s}`);
    return { signature };
}

async function proxy<T>(signedRequest: SignedRequest): Promise<T> {
    const response = await fetch('/api/turnkey/proxy', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(signedRequest),
    });
    return await response.json();
}
