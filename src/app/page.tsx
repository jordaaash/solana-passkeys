'use client';

import { ed25519 } from '@noble/curves/ed25519';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { browserInit, getWebAuthnAttestation, SignedRequest, TurnkeyActivityError, TurnkeyApi } from '@turnkey/http';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import styles from './page.module.css';

export default function Home() {
    useEffect(() => browserInit({ baseUrl: process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL! }), []);

    const [registration, setRegistration] = useLocalStorage<Registration | null>('registration', null);
    const publicKey = useMemo(() => (registration ? new PublicKey(registration.publicKey) : null), [registration]);
    const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), []);

    const onRegister = useCallback(async () => {
        if (registration) return;
        const newRegistration = await register();
        setRegistration(newRegistration);

        console.log(`https://explorer.solana.com/address/${newRegistration.publicKey}`);
        alert(`Registered: ${newRegistration.publicKey}`);
    }, [registration, setRegistration]);

    const onSignMessage = useCallback(async () => {
        if (!registration || !publicKey) return;
        const payload = getRandomBytes(32);
        const { signature } = await signRawPayload({
            payload,
            subOrganizationId: registration.subOrganizationId,
            privateKeyId: registration.privateKeyId,
        });

        alert(`Message signature valid? ${ed25519.verify(signature, payload, publicKey.toBytes())}`);
    }, [registration, publicKey]);

    const onRequestAirdrop = useCallback(async () => {
        if (!publicKey) return;
        const txid = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);

        console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        alert(`Airdrop requested! ${txid}`);

        await connection.confirmTransaction(txid, 'confirmed');

        alert(`Airdrop confirmed! ${txid}`);
    }, [publicKey, connection]);

    const onSignAndSendTransaction = useCallback(async () => {
        if (!registration || !publicKey) return;

        const {
            value: { blockhash, lastValidBlockHeight },
            context: { slot: minContextSlot },
        } = await connection.getLatestBlockhashAndContext();
        const transaction = new Transaction({
            feePayer: publicKey,
            blockhash,
            lastValidBlockHeight,
        }).add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: publicKey,
                lamports: 0,
            })
        );

        const { signature } = await signRawPayload({
            payload: transaction.serializeMessage(),
            subOrganizationId: registration.subOrganizationId,
            privateKeyId: registration.privateKeyId,
        });

        transaction.addSignature(publicKey, Buffer.from(signature));

        alert(`Transaction signature valid? ${transaction.verifySignatures()}`);

        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            minContextSlot,
        });

        console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        alert(`Transaction sent! ${txid}`);

        await connection.confirmTransaction(
            {
                signature: txid,
                blockhash,
                lastValidBlockHeight,
                minContextSlot,
            },
            'confirmed'
        );

        alert(`Transaction confirmed! ${txid}`);
    }, [registration, publicKey, connection]);

    return (
        <main className={styles.main}>
            {!registration ? (
                <button onClick={onRegister}>Register</button>
            ) : (
                <div>
                    <button onClick={onSignMessage}>Sign Message</button>
                    <button onClick={onRequestAirdrop}>Request Airdrop</button>
                    <button onClick={onSignAndSendTransaction}>Sign and Send Transaction</button>
                </div>
            )}
        </main>
    );
}

type Registration = { subOrganizationId: string; privateKeyId: string; publicKey: string };

async function register(): Promise<Registration> {
    const challenge = getRandomBytes(32);
    const attestation = await getWebAuthnAttestation({
        publicKey: {
            rp: {
                id: 'localhost',
                name: 'Solana Passkeys',
            },
            challenge: challenge.buffer,
            pubKeyCredParams: [
                {
                    type: 'public-key',
                    alg: -7,
                },
            ],
            user: {
                id: getRandomBytes(32).buffer,
                name: 'Solana Passkey',
                displayName: 'Solana Passkey',
            },
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

function getRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    const text = btoa(String.fromCharCode(...bytes));
    return text.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

type Signature = { signature: Uint8Array };

async function signRawPayload({
    payload,
    subOrganizationId,
    privateKeyId,
}: {
    payload: Uint8Array;
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
                payload: bytesToHex(payload),
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

function hexToBytes(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
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
